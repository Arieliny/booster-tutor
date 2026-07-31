import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  draftClaimsKey,
  draftCubeKey,
  draftCursorKey,
  draftMetaKey,
  draftOrderKey,
  loadDraftMeta,
  redis,
  validateSyncCode,
  type DraftMeta,
  type DraftSeat,
} from "./_redis.js";

/**
 * Rotisserie draft endpoint (server-authoritative).
 *
 *   GET  /api/draft?code=<code>
 *     → 200 { meta, claims: {cardId: seatId}, order: string[], cursor }
 *     Lightweight polling snapshot; no cube body.
 *   GET  /api/draft?code=<code>&action=cube
 *     → 200 <Cube>   (fetched once by joiners)
 *
 *   POST /api/draft?code=<code>
 *     { action: "create", cube, seats, cardsPerSeat }  → 200 { ok } | 409 exists
 *     { action: "pick", cardId, seatId }               → 200 { ok, cursor }
 *                                                        | 409 { error }
 *     { action: "undo" }                               → 200 { ok, cursor }
 *
 * The pick and undo mutations run as atomic Lua scripts so concurrent players
 * can never claim the same card or pick out of snake order.
 */

const MAX_SEATS = 8;
const MIN_SEATS = 2;

/**
 * Atomic pick. Reads the cursor, computes whose turn it is via the snake
 * formula, and only claims if (a) the draft isn't complete, (b) it's the
 * caller's turn, and (c) the card is unclaimed. Returns a status tuple.
 */
const PICK_SCRIPT = `
local cursorKey = KEYS[1]
local claimsKey = KEYS[2]
local orderKey  = KEYS[3]
local numSeats  = tonumber(ARGV[1])
local totalPicks = tonumber(ARGV[2])
local callerIdx = tonumber(ARGV[3])
local cardId    = ARGV[4]
local seatId    = ARGV[5]

local cursor = tonumber(redis.call('GET', cursorKey) or '0')
if cursor >= totalPicks then return {'complete'} end

local round = math.floor(cursor / numSeats)
local pos = cursor % numSeats
local turnIdx
if round % 2 == 0 then turnIdx = pos else turnIdx = numSeats - 1 - pos end
if turnIdx ~= callerIdx then return {'not_turn'} end

if redis.call('HEXISTS', claimsKey, cardId) == 1 then return {'claimed'} end

redis.call('HSET', claimsKey, cardId, seatId)
redis.call('RPUSH', orderKey, cardId .. ':' .. seatId .. ':' .. cursor)
local newCursor = redis.call('INCR', cursorKey)
return {'ok', newCursor}
`;

/** Atomic undo of the most recent pick. */
const UNDO_SCRIPT = `
local cursorKey = KEYS[1]
local claimsKey = KEYS[2]
local orderKey  = KEYS[3]
local cursor = tonumber(redis.call('GET', cursorKey) or '0')
if cursor <= 0 then return {'empty'} end
local last = redis.call('RPOP', orderKey)
if last then
  local cardId = string.match(last, '^(.-):')
  if cardId then redis.call('HDEL', claimsKey, cardId) end
end
local newCursor = redis.call('DECR', cursorKey)
return {'ok', newCursor}
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = validateSyncCode(req.query.code);
  if (!code) {
    res.status(400).json({ error: "Invalid draft code" });
    return;
  }

  try {
    if (req.method === "GET") return await handleGet(code, req, res);
    if (req.method === "POST") return await handlePost(code, req, res);
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("draft handler error:", err);
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Server error" });
  }
}

async function handleGet(
  code: string,
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.query.action === "cube") {
    const cube = await redis.get(draftCubeKey(code));
    if (!cube) {
      res.status(404).json({ error: "Draft not found" });
      return;
    }
    res.status(200).json(cube);
    return;
  }

  const meta = await loadDraftMeta(code);
  if (!meta) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }
  const [claims, order, cursorRaw] = await Promise.all([
    redis.hgetall<Record<string, string>>(draftClaimsKey(code)),
    redis.lrange(draftOrderKey(code), 0, -1),
    redis.get<number | string>(draftCursorKey(code)),
  ]);
  res.status(200).json({
    meta,
    claims: claims ?? {},
    order: order ?? [],
    cursor: Number(cursorRaw ?? 0),
  });
}

async function handlePost(
  code: string,
  req: VercelRequest,
  res: VercelResponse,
) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  switch (body.action) {
    case "create":
      return await create(code, body, res);
    case "pick":
      return await pick(code, body, res);
    case "undo":
      return await undo(code, res);
    default:
      res.status(400).json({ error: `Unknown action: ${String(body.action)}` });
  }
}

async function create(
  code: string,
  body: Record<string, unknown>,
  res: VercelResponse,
) {
  const cube = body.cube as
    | { id?: unknown; name?: unknown; cards?: unknown }
    | undefined;
  const seats = body.seats as DraftSeat[] | undefined;
  const cardsPerSeat = body.cardsPerSeat;

  if (
    !cube ||
    typeof cube.id !== "string" ||
    typeof cube.name !== "string" ||
    !Array.isArray(cube.cards)
  ) {
    res.status(400).json({ error: "Invalid cube payload" });
    return;
  }
  if (
    !Array.isArray(seats) ||
    seats.length < MIN_SEATS ||
    seats.length > MAX_SEATS ||
    !seats.every(
      (s) => s && typeof s.id === "string" && typeof s.name === "string",
    )
  ) {
    res.status(400).json({ error: "Invalid seats" });
    return;
  }
  if (typeof cardsPerSeat !== "number" || cardsPerSeat < 1) {
    res.status(400).json({ error: "Invalid cardsPerSeat" });
    return;
  }

  // Refuse to clobber an existing draft at this code.
  const existing = await redis.get(draftMetaKey(code));
  if (existing) {
    res.status(409).json({ error: "A draft already exists at this code" });
    return;
  }

  const cardCount = cube.cards.length;
  const totalPicks = Math.min(cardsPerSeat * seats.length, cardCount);
  const meta: DraftMeta = {
    cubeId: cube.id,
    cubeName: cube.name,
    cardCount,
    seats,
    cardsPerSeat,
    totalPicks,
    createdAt: new Date().toISOString(),
  };

  await Promise.all([
    redis.set(draftCubeKey(code), cube),
    redis.set(draftMetaKey(code), meta),
    redis.set(draftCursorKey(code), 0),
  ]);

  res.status(200).json({ ok: true });
}

async function pick(
  code: string,
  body: Record<string, unknown>,
  res: VercelResponse,
) {
  const cardId = body.cardId;
  const seatId = body.seatId;
  if (typeof cardId !== "string" || typeof seatId !== "string") {
    res.status(400).json({ error: "Missing cardId or seatId" });
    return;
  }

  const meta = await loadDraftMeta(code);
  if (!meta) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }
  const callerIdx = meta.seats.findIndex((s) => s.id === seatId);
  if (callerIdx < 0) {
    res.status(400).json({ error: "Unknown seat" });
    return;
  }

  const result = (await redis.eval(
    PICK_SCRIPT,
    [draftCursorKey(code), draftClaimsKey(code), draftOrderKey(code)],
    [
      String(meta.seats.length),
      String(meta.totalPicks),
      String(callerIdx),
      cardId,
      seatId,
    ],
  )) as [string, number?];

  const status = result[0];
  if (status === "ok") {
    res.status(200).json({ ok: true, cursor: result[1] });
    return;
  }
  // not_turn / claimed / complete — the client should refetch state and reconcile.
  res.status(409).json({ error: status });
}

async function undo(code: string, res: VercelResponse) {
  const meta = await loadDraftMeta(code);
  if (!meta) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }
  const result = (await redis.eval(
    UNDO_SCRIPT,
    [draftCursorKey(code), draftClaimsKey(code), draftOrderKey(code)],
    [],
  )) as [string, number?];

  if (result[0] === "ok") {
    res.status(200).json({ ok: true, cursor: result[1] });
    return;
  }
  res.status(200).json({ ok: true, cursor: 0 });
}
