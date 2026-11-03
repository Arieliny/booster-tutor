/**
 * Run judge test questions (tests/judge-eval/questions.json) through the REAL
 * judge: the same handler as /api/judge, with the API key in .env.local, so
 * each question costs what a ruling costs (about 7-12 cents). Signs in as a
 * throwaway owner on an in-memory Redis, so nothing touches production.
 *
 *   npx tsx scripts/judge-eval.ts                    the questions marked "api"
 *   npx tsx scripts/judge-eval.ts saga-blood-moon    just these ids
 *   npx tsx scripts/judge-eval.ts --hard             the hard ones marked "api"
 *   npx tsx scripts/judge-eval.ts --budget 1         stop once this many dollars are spent (default 1.5)
 *
 * Writes the answers (with cost and what it looked up) to
 * tests/judge-eval/runs/<date>-api.json. Grading is by hand or by Claude Code
 * against each question's mustSay / mustNotSay, which costs no API usage.
 */
import tls from "node:tls";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

try {
  tls.setDefaultCACertificates([...tls.getCACertificates("default"), ...tls.getCACertificates("system")]);
} catch {
  // Older Node: run with `node --use-system-ca` instead.
}
process.env.BT_FAKE_REDIS = "1";
process.loadEnvFile(".env.local");
if (!process.env.ANTHROPIC_API_KEY) throw new Error("No ANTHROPIC_API_KEY in .env.local: the real judge can't run.");

const { default: handler } = await import("../api/judge.js");
const { createUser, startSession } = await import("../api/_auth.js");

interface Question {
  id: string;
  cards: string[];
  ask: string;
  /** Earlier turns, for follow-up questions. */
  history?: { role: "user" | "assistant"; content: string }[];
  api?: boolean;
  hard?: boolean;
}

const args = process.argv.slice(2);
const budgetAt = args.indexOf("--budget");
const budget = budgetAt >= 0 ? Number(args[budgetAt + 1]) : 1.5;
const ids = args.filter((a, i) => !a.startsWith("--") && i !== budgetAt + 1);
const hardOnly = args.includes("--hard");
const all: Question[] = JSON.parse(readFileSync("tests/judge-eval/questions.json", "utf8")).questions;
const chosen = ids.length ? all.filter((q) => ids.includes(q.id)) : all.filter((q) => q.api && (!hardOnly || q.hard));
if (!chosen.length) throw new Error(`No questions match ${ids.join(", ") || '"api": true'}.`);

// A throwaway owner (owners have no monthly limit and see each answer's cost).
let cookie = "";
const owner = await createUser("Judge test", "owner", []);
await startSession({ setHeader: (_k: string, v: string) => (cookie = v.split(";")[0]) } as never, owner.id);

/** One question through the handler, collecting the stream it writes. */
async function ask(q: Question) {
  const events: Record<string, unknown>[] = [];
  let buffer = "";
  let status = 200;
  let json: unknown = null;
  await new Promise<void>((resolve) => {
    const res = {
      status: (s: number) => ((status = s), res),
      setHeader: () => res,
      json: (body: unknown) => ((json = body), resolve(), res),
      write: (chunk: string) => ((buffer += chunk), true),
      end: (chunk?: string) => {
        if (chunk) buffer += chunk;
        resolve();
      },
      on: () => res,
    };
    const req = { method: "POST", headers: { cookie }, query: {}, body: { messages: [...(q.history ?? []), { role: "user", content: q.ask }], cards: q.cards } };
    void handler(req as never, res as never);
  });
  for (const line of buffer.split("\n")) if (line.trim()) events.push(JSON.parse(line));
  let answer = "";
  for (const e of events) {
    if (e.type === "text") answer += String(e.delta);
    else if (e.type === "reset") answer = "";
  }
  const done = events.find((e) => e.type === "done");
  const error = events.find((e) => e.type === "error")?.message ?? (status !== 200 ? JSON.stringify(json) : undefined);
  return {
    id: q.id,
    answer,
    lookups: events.filter((e) => e.type === "status").map((e) => String(e.text)),
    cost: typeof done?.cost === "number" ? done.cost : null,
    ...(error ? { error } : {}),
  };
}

const results = [];
let spent = 0;
for (const q of chosen) {
  if (spent >= budget) {
    console.log(`Budget of $${budget} reached; skipping the rest.`);
    break;
  }
  process.stdout.write(`${q.id} ... `);
  const r = await ask(q);
  spent += r.cost ?? 0;
  results.push(r);
  console.log(r.error ? `ERROR ${r.error}` : `$${(r.cost ?? 0).toFixed(3)}`);
}

mkdirSync("tests/judge-eval/runs", { recursive: true });
const file = `tests/judge-eval/runs/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-api.json`;
writeFileSync(file, JSON.stringify({ ran: new Date().toISOString(), spent, results }, null, 2) + "\n");
console.log(`\n${results.length} answered, about $${spent.toFixed(2)} in all. Saved to ${file}`);
