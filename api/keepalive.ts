import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis.js";

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
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("keepalive failed:", err);
    res.status(500).json({ ok: false });
  }
}
