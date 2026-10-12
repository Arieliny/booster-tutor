/**
 * Local API server for testing the serverless functions without Vercel.
 *
 *   npx tsx scripts/dev-api.ts            (port 5186)
 *
 * Runs the real handlers in api/*.ts against an IN-MEMORY Redis (see
 * api/_fake-redis.ts), so nothing here ever touches the production database,
 * and state resets on restart. vite.config.ts proxies /api to this port for
 * `npm run dev` and `npm run preview`.
 *
 * The owner PIN for this local server is a throwaway test value, set below.
 * It has nothing to do with the real EDIT_PIN on Vercel.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

process.env.BT_FAKE_REDIS = "1";
process.env.EDIT_PIN = process.env.EDIT_PIN ?? "424242"; // local test value only

const PORT = Number(process.env.PORT ?? 5186);
const API_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "api");

type Handler = (req: unknown, res: unknown) => Promise<void> | void;

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Just enough of VercelRequest / VercelResponse for our handlers. */
function adapt(req: IncomingMessage, res: ServerResponse, url: URL, body: unknown) {
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (query[k] = v));
  const vreq = Object.assign(req, { query, body, cookies: {} });
  const vres = Object.assign(res, {
    status(code: number) {
      res.statusCode = code;
      return vres;
    },
    json(data: unknown) {
      if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(data));
      return vres;
    },
    send(data: unknown) {
      res.end(typeof data === "string" ? data : JSON.stringify(data));
      return vres;
    },
  });
  return { vreq, vres };
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const name = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  const file = join(API_DIR, `${name}.ts`);
  if (!/^[a-z-]+$/.test(name) || !existsSync(file)) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: `No API route /api/${name}` }));
    return;
  }
  try {
    const mod = (await import(pathToFileURL(file).href)) as { default: Handler };
    const { vreq, vres } = adapt(req, res, url, await readBody(req));
    await mod.default(vreq, vres);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(err) }));
  }
}).listen(PORT, () => console.log(`dev API on http://localhost:${PORT} (in-memory Redis)`));
