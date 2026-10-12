import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "./_auth.js";
import { redis } from "./_redis.js";

/**
 * Per-account data that follows a person across devices: Cube review
 * decisions, hand-added cards and printing choices.
 *
 *   GET  /api/userdata?since=<rev>
 *        -> { rev, unchanged: true }               nothing new since <rev>
 *        -> { rev, decisions, extras, art }        the full set otherwise
 *   POST /api/userdata { decisions?, extras?, art? }   (changed entries only)
 *        -> { rev, applied }
 *
 * Merge rule, per entry: decisions and art carry an edit time `t` and the
 * NEWER edit wins (so the same push twice, or a stale one, changes nothing).
 * A cleared decision / reset printing is still an entry with its own `t`, so
 * clearing travels too. Hand-added cards are add-only. Every real change bumps
 * `rev`, which is what makes the cheap "anything new?" poll possible.
 *
 * Keys: ud:{userId}:decisions | :art | :extras  HASH id -> JSON;  ud:{userId}:rev  INT
 */

type Stamped = { t: number } & Record<string, unknown>;
const KINDS = ["decisions", "art"] as const;
const MAX_ENTRIES = 5000;

const key = (userId: string, part: string) => `ud:${userId}:${part}`;

function stampedEntries(input: unknown): [string, Stamped][] {
  if (!input || typeof input !== "object") return [];
  return Object.entries(input as Record<string, unknown>)
    .filter((e): e is [string, Stamped] => {
      const v = e[1] as Stamped | null;
      return typeof e[0] === "string" && e[0].length <= 64 && !!v && typeof v === "object" && typeof v.t === "number";
    })
    .slice(0, MAX_ENTRIES);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const me = await requireUser(req, res);
    if (!me) return;

    if (req.method === "GET") {
      const rev = Number((await redis.get<number>(key(me.id, "rev"))) ?? 0);
      const since = Number(req.query.since ?? -1);
      if (since === rev) {
        res.status(200).json({ rev, unchanged: true });
        return;
      }
      const [decisions, art, extras] = await Promise.all([
        redis.hgetall<Record<string, Stamped>>(key(me.id, "decisions")),
        redis.hgetall<Record<string, Stamped>>(key(me.id, "art")),
        redis.hgetall<Record<string, unknown>>(key(me.id, "extras")),
      ]);
      res.status(200).json({ rev, decisions: decisions ?? {}, art: art ?? {}, extras: extras ?? {} });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    let applied = 0;

    for (const kind of KINDS) {
      const incoming = stampedEntries(body[kind]);
      if (!incoming.length) continue;
      const ids = incoming.map(([id]) => id);
      const current = ((await redis.hmget<Record<string, Stamped | null>>(key(me.id, kind), ...ids)) ?? {}) as Record<
        string,
        Stamped | null
      >;
      const newer: Record<string, Stamped> = {};
      for (const [id, v] of incoming) {
        const cur = current[id];
        if (!cur || typeof cur.t !== "number" || v.t > cur.t) newer[id] = v;
      }
      if (Object.keys(newer).length) {
        await redis.hset(key(me.id, kind), newer);
        applied += Object.keys(newer).length;
      }
    }

    // Hand-added cards: add-only, keyed by Oracle id.
    if (body.extras && typeof body.extras === "object") {
      const cards = Object.entries(body.extras as Record<string, unknown>)
        .filter(([id, c]) => typeof id === "string" && id.length <= 64 && !!c && typeof c === "object")
        .slice(0, MAX_ENTRIES);
      if (cards.length) {
        const ids = cards.map(([id]) => id);
        const have = ((await redis.hmget<Record<string, unknown>>(key(me.id, "extras"), ...ids)) ?? {}) as Record<string, unknown>;
        const fresh = Object.fromEntries(cards.filter(([id]) => !have[id]));
        if (Object.keys(fresh).length) {
          await redis.hset(key(me.id, "extras"), fresh);
          applied += Object.keys(fresh).length;
        }
      }
    }

    const rev = applied ? await redis.incr(key(me.id, "rev")) : Number((await redis.get<number>(key(me.id, "rev"))) ?? 0);
    res.status(200).json({ rev, applied });
  } catch (err) {
    console.error("userdata handler error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
