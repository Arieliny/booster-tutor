import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis.js";

/**
 * ONE-TIME CLEANUP (2026-10-12; remove once it has run in production).
 * Rotisserie was deleted from the app, and its drafts were stored with no
 * expiry. Ari approved clearing them. Touches ONLY `draft:*` keys, and records
 * that it ran so it never runs twice.
 */
const DRAFTS_CLEARED = "cleanup:rotisserie-drafts";

async function clearRotisserieDrafts(): Promise<{ deleted: number } | null> {
  if (await redis.get(DRAFTS_CLEARED)) return null;
  let cursor: string | number = 0;
  let deleted = 0;
  do {
    const [next, keys]: [string, string[]] = await redis.scan(cursor, { match: "draft:*", count: 500 });
    if (keys.length) deleted += await redis.del(...keys);
    cursor = next;
  } while (String(cursor) !== "0");
  await redis.set(DRAFTS_CLEARED, { at: new Date().toISOString(), deleted });
  return { deleted };
}

/**
 * Daily keep-alive (Vercel cron, see vercel.json).
 *
 * Upstash's free tier archives a database after a stretch of inactivity - it
 * happened on 2026-09-18 and broke every sync call. Now that sign-ins and the
 * user list live there too, an archive would lock everyone out, owner
 * included. One small write a day keeps it active.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    await redis.set("keepalive:last", new Date().toISOString());
    const cleanup = await clearRotisserieDrafts();
    res.status(200).json({ ok: true, cleanup });
  } catch (err) {
    console.error("keepalive failed:", err);
    res.status(500).json({ ok: false });
  }
}
