import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  cubeKey,
  inventoryKey,
  loadMeta,
  redis,
  saveMeta,
  validateSyncCode,
  type CubeMetaEntry,
} from "./_redis.js";

/**
 * Sync endpoint.
 *
 *   GET  /api/sync?code=<code>
 *     → 200 { meta: { cubes: {[id]: CubeMetaEntry} },
 *             inventories: {[cubeId]: string[]} }
 *     Lightweight: no full cube data. Cubes are pulled on demand from
 *     /api/cube?code=<code>&id=<id>.
 *
 *   POST /api/sync?code=<code>
 *     body: { action: "putCube", cube: Cube }
 *         | { action: "archiveCube", id: string }
 *         | { action: "restoreCube", id: string }
 *         | { action: "putInventory", cubeId: string, ids: string[] }
 *     → 200 { ok: true }
 *
 * Note: there is no permanent-delete action by design. The only way to
 * fully remove a cube is via direct KV access by the project owner.
 *
 * ACCESS MODEL: this is one shared library. GET is open to anyone. Every POST
 * (write) must carry the edit PIN in the `x-edit-key` header, matched against
 * the EDIT_PIN env var. If that env var isn't set we fail CLOSED (503) rather
 * than leaving the library world-writable.
 *
 * A short numeric PIN is only a handful of guesses wide, so wrong attempts are
 * rate-limited per IP in Redis: after MAX_FAILED_ATTEMPTS the caller is locked
 * out for LOCKOUT_SECONDS. That's what makes a memorable PIN safe here — the
 * secret is weak, so the guessing budget has to be small. A correct PIN clears
 * the counter. Limiting per IP (rather than globally) means a stranger
 * hammering the endpoint can't lock the owner out.
 */

const EDIT_HEADER = "x-edit-key";
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_SECONDS = 15 * 60;

type AuthResult = { ok: true } | { ok: false; status: number; error: string };

function clientIp(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  const first = typeof raw === "string" ? raw.split(",")[0].trim() : "";
  return first || "unknown";
}

function attemptsKey(ip: string): string {
  return `editauth:fails:${ip}`;
}

/** Constant-time compare that doesn't leak length via early return. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Still burn a comparison so timing doesn't trivially reveal length.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

async function authorizeWrite(req: VercelRequest): Promise<AuthResult> {
  const expected = process.env.EDIT_PIN;
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "Editing is not configured on the server (EDIT_PIN is unset).",
    };
  }

  const key = attemptsKey(clientIp(req));
  const fails = Number((await redis.get<number | string>(key)) ?? 0);
  if (fails >= MAX_FAILED_ATTEMPTS) {
    return {
      ok: false,
      status: 429,
      error: `Too many incorrect PIN attempts. Try again in ${Math.round(
        LOCKOUT_SECONDS / 60,
      )} minutes.`,
    };
  }

  const raw = req.headers[EDIT_HEADER];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  if (typeof provided !== "string" || !secretsMatch(provided, expected)) {
    const next = await redis.incr(key);
    // Start the window on the first failure so lockouts actually expire.
    if (next === 1) await redis.expire(key, LOCKOUT_SECONDS);
    return {
      ok: false,
      status: 401,
      error: "Invalid PIN",
    };
  }

  await redis.del(key);
  return { ok: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = validateSyncCode(req.query.code);
  if (!code) {
    res.status(400).json({ error: "Invalid sync code" });
    return;
  }

  try {
    if (req.method === "GET") return await handleGet(code, res);
    if (req.method === "POST") return await handlePost(code, req, res);
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("sync handler error:", err);
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Server error" });
  }
}

async function handleGet(code: string, res: VercelResponse) {
  const meta = await loadMeta(code);
  const ids = Object.keys(meta.cubes);

  const inventories: Record<string, string[]> = {};
  if (ids.length > 0) {
    const keys = ids.map((id) => inventoryKey(code, id));
    const values = (await redis.mget<(string[] | null)[]>(...keys)) ?? [];
    ids.forEach((id, i) => {
      const v = values[i];
      if (Array.isArray(v)) inventories[id] = v;
    });
  }

  res.status(200).json({ meta, inventories });
}

async function handlePost(
  code: string,
  req: VercelRequest,
  res: VercelResponse,
) {
  const auth = await authorizeWrite(req);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = body.action;

  // Password-only probe used by the client's unlock flow. Reaching here means
  // authorizeWrite already passed.
  if (action === "verify") {
    res.status(200).json({ ok: true });
    return;
  }

  if (action === "putCube") return await putCube(code, body, res);
  if (action === "archiveCube") return await setArchived(code, body, res, true);
  if (action === "restoreCube") return await setArchived(code, body, res, false);
  if (action === "putInventory") return await putInventory(code, body, res);

  res.status(400).json({ error: `Unknown action: ${String(action)}` });
}

async function putCube(
  code: string,
  body: Record<string, unknown>,
  res: VercelResponse,
) {
  const cube = body.cube as
    | { id?: unknown; name?: unknown; cards?: unknown }
    | undefined;
  if (
    !cube ||
    typeof cube.id !== "string" ||
    typeof cube.name !== "string" ||
    !Array.isArray(cube.cards)
  ) {
    res.status(400).json({ error: "Invalid cube payload" });
    return;
  }

  const meta = await loadMeta(code);
  const existing = meta.cubes[cube.id];

  // Preserve archived state if the cube already exists; new cubes default to
  // not archived.
  const archived = existing?.archived ?? false;

  await redis.set(cubeKey(code, cube.id), cube);
  meta.cubes[cube.id] = {
    id: cube.id,
    name: cube.name,
    cardCount: cube.cards.length,
    archived,
    lastModified: new Date().toISOString(),
  };
  await saveMeta(code, meta);

  res.status(200).json({ ok: true });
}

async function setArchived(
  code: string,
  body: Record<string, unknown>,
  res: VercelResponse,
  archived: boolean,
) {
  const id = body.id;
  if (typeof id !== "string") {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const meta = await loadMeta(code);
  const entry = meta.cubes[id];
  if (!entry) {
    res.status(404).json({ error: "Cube not found" });
    return;
  }
  const updated: CubeMetaEntry = {
    ...entry,
    archived,
    lastModified: new Date().toISOString(),
  };
  meta.cubes[id] = updated;
  await saveMeta(code, meta);
  res.status(200).json({ ok: true });
}

async function putInventory(
  code: string,
  body: Record<string, unknown>,
  res: VercelResponse,
) {
  const cubeId = body.cubeId;
  const ids = body.ids;
  if (typeof cubeId !== "string") {
    res.status(400).json({ error: "Missing cubeId" });
    return;
  }
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) {
    res.status(400).json({ error: "Invalid ids" });
    return;
  }
  await redis.set(inventoryKey(code, cubeId), ids);
  res.status(200).json({ ok: true });
}
