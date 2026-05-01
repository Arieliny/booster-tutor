import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cubeKey, redis, validateSyncCode } from "./_redis";

/**
 * GET /api/cube?code=<code>&id=<id>
 *   → 200 Cube  (the full cube body, including all card records)
 *   → 404 if not found
 *
 * Pulled lazily by the client on first sync to a new device, so we don't
 * have to send the full body of every cube on every page load.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const code = validateSyncCode(req.query.code);
  if (!code) {
    res.status(400).json({ error: "Invalid sync code" });
    return;
  }

  const id = req.query.id;
  if (typeof id !== "string" || !id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }

  try {
    const cube = await redis.get(cubeKey(code, id));
    if (!cube) {
      res.status(404).json({ error: "Cube not found" });
      return;
    }
    res.status(200).json(cube);
  } catch (err) {
    console.error("cube handler error:", err);
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Server error" });
  }
}
