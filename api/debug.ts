import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Debug-only endpoint to verify env var presence and basic Redis connectivity.
 * Returns minimal info — never values — to avoid leaking secrets.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const env = {
    KV_REST_API_URL: !!process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN,
    KV_URL: !!process.env.KV_URL,
    REDIS_URL: !!process.env.REDIS_URL,
    NODE_VERSION: process.version,
  };

  let importOk = false;
  let importErr: string | null = null;
  let pingOk = false;
  let pingErr: string | null = null;
  try {
    const { redis } = await import("./_redis");
    importOk = true;
    try {
      const out = await redis.ping();
      pingOk = out === "PONG";
    } catch (err) {
      pingErr = err instanceof Error ? err.message : String(err);
    }
  } catch (err) {
    importErr = err instanceof Error ? err.message : String(err);
  }

  res.status(200).json({ env, importOk, importErr, pingOk, pingErr });
}
