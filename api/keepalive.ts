import type { VercelRequest, VercelResponse } from "@vercel/node";
import { refreshData } from "./_data-refresh.js";
import { redis } from "./_redis.js";

/**
 * Daily keep-alive (Vercel cron, see vercel.json).
 *
 * Upstash's free tier archives a database after a stretch of inactivity - it
 * happened on 2026-09-18 and broke every sync call. Now that sign-ins and the
 * user list live there too, an archive would lock everyone out, owner
 * included. One small write a day keeps it active.
 *
 * The same daily run checks whether the cards and the Comprehensive Rules
 * are out of date and, if so, starts a fresh build (api/_data-refresh.ts).
 * It shares this cron rather than adding one, to stay inside the Hobby
 * plan's cron limits.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    await redis.set("keepalive:last", new Date().toISOString());
  } catch (err) {
    console.error("keepalive failed:", err);
    res.status(500).json({ ok: false });
    return;
  }
  let data;
  try {
    data = await refreshData();
    if (data.action !== "current") console.log("data refresh:", data.action, data.reasons.join("; "));
  } catch (err) {
    console.error("data refresh failed:", err);
    data = { action: "error" };
  }
  res.status(200).json({ ok: true, data });
}
