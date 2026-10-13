import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolResultBlockParam, ToolUnion, Usage } from "@anthropic-ai/sdk/resources/messages/messages";
import { canUse, requireUser } from "./_auth.js";
import { glossChunks, loadCr, numsList, refsChunks, ruleChunks, searchChunks, type Cr } from "./_cr.js";
import { lookupCards } from "./_scryfall.js";
import { claimRuling, recordUsage, refundRuling, usageFor, type TokenUsage } from "./_judge-usage.js";
import { judgePrompt } from "./_judge-prompt.js";
import { OFF_TOPIC_REPLY, checkTopic, noteRefusal, refusedTooOften } from "./_judge-guard.js";
import {
  clearHistory,
  deleteThread,
  getThread,
  isThreadId,
  listThreads,
  newThreadId,
  saveThread,
  type ThreadMessage,
} from "./_judge-history.js";

/**
 * The rules judge (Claude, billed to the owner's API key).
 *
 *   GET  /api/judge -> { used, limit, remaining, cr }             this month's allowance + CR date
 *   GET  /api/judge?history=1 -> { threads }                    your last 50 threads (newest first)
 *   GET  /api/judge?thread=ID -> { thread }                     one thread, to reread or continue
 *   POST /api/judge { action: "deleteThread", id } | { action: "clearHistory" }
 *   POST /api/judge { messages: [{role, content}], cards?: string[], threadId? }
 *        -> a stream of JSON lines:
 *           {type:"thread", id}     the thread this question was saved to
 *           {type:"status", text}   what it's looking up ("Looking up Spell Queller")
 *           {type:"text", delta}    the answer, as it's written
 *           {type:"reset"}          drop any text so far (it went back to look something up)
 *           {type:"done", remaining}
 *           {type:"error", message}
 *
 * Magic only: a small model screens every question first (_judge-guard.ts);
 * anything else gets a fixed refusal and uses no ruling.
 *
 * Each question uses one of the person's monthly rulings (refunded if it fails
 * before answering). The browser sends the conversation whole; after each
 * answer the thread is saved to the person's history (_judge-history.ts),
 * which only they can read.
 */

const MODEL = "claude-opus-5-5";
const MAX_TURNS = 6;
const MAX_HISTORY = 12;
const MAX_CHARS = 4000;

const BRIEF: Tool = {
  name: "brief",
  description:
    "Look up everything a ruling needs in ONE call: cards (current Oracle text, every face, official rulings with dates, format legality, related cards) and the Comprehensive Rules (rules with subrules by number, rules plus their cross-references, glossary definitions, keyword search). Combine all fields you need; guess slightly wide.",
  input_schema: {
    type: "object",
    properties: {
      cards: { type: "array", items: { type: "string" }, description: "Full card names, e.g. [\"Blood Moon\", \"Urza's Saga\"]" },
      search: { type: "string", description: "Keywords to search the rules and glossary, e.g. \"layer type-changing\"" },
      rules: { type: "array", items: { type: "string" }, description: "Rule numbers to read with their subrules, e.g. [\"613.1\", \"704.5\"]" },
      refs: { type: "array", items: { type: "string" }, description: "Rule numbers to read plus every rule they cross-reference" },
      glossary: { type: "array", items: { type: "string" }, description: "Glossary terms, e.g. [\"mana ability\"]" },
      legality: { type: "boolean", description: "Include format legality for cards (default true)" },
    },
  },
};

const WEB_SEARCH: ToolUnion = {
  type: "web_search_20260318",
  name: "web_search",
  max_uses: 3,
  allowed_domains: ["magic.wizards.com", "blogs.magicjudges.org", "magicjudges.org", "wpn.wizards.com"],
};

interface BriefInput {
  cards?: string[];
  search?: string;
  rules?: string[];
  refs?: string[];
  glossary?: string[];
  legality?: boolean;
}

/** What the person sees while the judge looks things up. */
function describe(input: BriefInput): string {
  const parts: string[] = [];
  if (input.cards?.length) parts.push(`Looking up ${input.cards.join(", ")}`);
  const nums = [...numsList(input.rules), ...numsList(input.refs)];
  if (nums.length) parts.push(`reading CR ${nums.join(", ")}`);
  if (input.search) parts.push(`searching the rules for “${input.search}”`);
  if (input.glossary?.length) parts.push(`checking the glossary`);
  const s = parts.join(" · ") || "Checking the rules";
  return s[0].toUpperCase() + s.slice(1);
}

async function runBrief(input: BriefInput, cr: Cr | null): Promise<string> {
  const out: string[] = [];
  if (input.cards?.length) out.push("########## CARDS ##########", ...(await lookupCards(input.cards, input.legality !== false)));
  const wantsCr = input.search || input.rules?.length || input.refs?.length || input.glossary?.length;
  if (wantsCr && !cr) out.push("NO_CR: the Comprehensive Rules couldn't be loaded. Rule from Oracle text and official rulings, and say you couldn't cite CR numbers.");
  if (wantsCr && cr) {
    if (input.search) out.push("\n########## SEARCH ##########", ...searchChunks(cr, input.search));
    if (input.rules?.length) out.push("\n########## RULES ##########", ...ruleChunks(cr, numsList(input.rules)));
    if (input.refs?.length) out.push("\n########## REFS ##########", ...refsChunks(cr, numsList(input.refs)));
    if (input.glossary?.length) out.push("\n########## GLOSSARY ##########", ...glossChunks(cr, input.glossary));
  }
  return out.join("\n") || "Nothing requested.";
}

/**
 * The conversation as sent by the browser, checked and trimmed: `msgs` for the
 * model (the cards prefixed to the latest question), `plain` as asked (for history).
 */
function readHistory(body: Record<string, unknown>): { msgs: MessageParam[]; plain: ThreadMessage[]; cards: string[] } | null {
  if (!Array.isArray(body.messages)) return null;
  const msgs = body.messages
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && !!m.content.trim(),
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  const cards = Array.isArray(body.cards)
    ? body.cards.filter((c): c is string => typeof c === "string" && !!c.trim()).slice(0, 10)
    : [];
  const plain = msgs.map((m) => ({ ...m }));
  if (cards.length) {
    const last = msgs[msgs.length - 1];
    last.content = `Cards on the table: ${cards.join("; ")}\n\n${last.content}`;
  }
  return { msgs, plain, cards };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  const me = await requireUser(req, res, (u) => canUse(u, "judge"));
  if (!me) return;

  if (req.method === "GET" && req.query.history) {
    res.status(200).json({ threads: await listThreads(me.id) });
    return;
  }
  if (req.method === "GET" && req.query.thread) {
    const id = String(req.query.thread);
    const thread = isThreadId(id) ? await getThread(me.id, id) : null;
    if (!thread) res.status(404).json({ error: "That thread isn't in your history any more." });
    else res.status(200).json({ thread });
    return;
  }
  if (req.method === "GET") {
    const [u, cr] = await Promise.all([usageFor(me), loadCr()]);
    res.status(200).json({
      used: u.used,
      limit: u.limit,
      remaining: u.limit === null ? null : Math.max(0, u.limit - u.used),
      cr: cr?.effective ?? null,
    });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.action === "deleteThread") {
    if (isThreadId(body.id)) await deleteThread(me.id, body.id);
    res.status(200).json({ ok: true });
    return;
  }
  if (body.action === "clearHistory") {
    await clearHistory(me.id);
    res.status(200).json({ ok: true });
    return;
  }

  const asked = readHistory(body);
  if (!asked) {
    res.status(400).json({ error: "Ask a question." });
    return;
  }
  const history = asked.msgs;
  const threadId = isThreadId(body.threadId) ? body.threadId : newThreadId();

  // Magic only. Checked before a ruling is used or the judge is called.
  if (await refusedTooOften(me.id)) {
    res.status(429).json({ error: "The judge is paused for you until tomorrow: it only answers Magic questions." });
    return;
  }
  let topic: "other" | null;
  try {
    topic = await checkTopic(history);
  } catch (err) {
    console.error("judge topic check failed:", err);
    res.status(503).json({ error: "The judge couldn't check your question just now. Try again in a moment." });
    return;
  }
  if (topic) {
    await noteRefusal(me.id);
    const u = await usageFor(me);
    res.status(200).setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.write(JSON.stringify({ type: "text", delta: OFF_TOPIC_REPLY }) + "\n");
    res.end(JSON.stringify({ type: "done", remaining: u.limit === null ? null : Math.max(0, u.limit - u.used), refused: true }) + "\n");
    return;
  }

  const remaining = await claimRuling(me);
  if (remaining === false) {
    res.status(429).json({ error: "That's all your rulings for this month. They reset on the 1st." });
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  // The answer as it's written (dropped when it goes back to look something up), for history.
  let answer = "";
  const send = (e: Record<string, unknown>) => {
    if (e.type === "text") answer += String(e.delta);
    else if (e.type === "reset") answer = "";
    res.write(JSON.stringify(e) + "\n");
  };
  send({ type: "thread", id: threadId });

  const abort = new AbortController();
  res.on("close", () => abort.abort());
  const tokens: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const count = (u: Usage) => {
    tokens.input += u.input_tokens;
    tokens.output += u.output_tokens;
    tokens.cacheRead += u.cache_read_input_tokens ?? 0;
    tokens.cacheWrite += u.cache_creation_input_tokens ?? 0;
  };
  let answered = false;

  try {
    const cr = await loadCr();
    // BT_FAKE_JUDGE: local tests that shouldn't spend real rulings, even with a key set.
    if (!process.env.ANTHROPIC_API_KEY || (process.env.BT_FAKE_REDIS && process.env.BT_FAKE_JUDGE)) {
      if (process.env.BT_FAKE_REDIS) await fakeJudge(history, cr, send);
      else throw new Error("The judge isn't set up yet: ANTHROPIC_API_KEY is missing on the server.");
      answered = true;
    } else {
      const client = new Anthropic();
      const messages: MessageParam[] = [...history];
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const last = turn === MAX_TURNS - 1;
        const stream = client.messages.stream(
          {
            model: MODEL,
            max_tokens: 16000,
            thinking: { type: "adaptive", display: "omitted" },
            output_config: { effort: "high" },
            system: [{ type: "text", text: judgePrompt(cr?.effective ?? null), cache_control: { type: "ephemeral" } }],
            tools: [BRIEF, WEB_SEARCH],
            // Out of turns: answer with what's been gathered.
            tool_choice: last ? { type: "none" } : { type: "auto" },
            messages,
          },
          { signal: abort.signal },
        );
        stream.on("text", (delta) => {
          answered = true;
          send({ type: "text", delta });
        });
        const msg = await stream.finalMessage();
        count(msg.usage);

        if (msg.stop_reason === "pause_turn") {
          // A long web search paused the turn; continue it as is.
          messages.push({ role: "assistant", content: msg.content });
          continue;
        }
        if (msg.stop_reason !== "tool_use") break;

        // It's going to look things up: anything written so far was a preamble.
        send({ type: "reset" });
        answered = false;
        messages.push({ role: "assistant", content: msg.content });
        const results: ToolResultBlockParam[] = [];
        for (const block of msg.content) {
          if (block.type !== "tool_use") continue;
          const input = (block.input ?? {}) as BriefInput;
          send({ type: "status", text: describe(input) });
          results.push({ type: "tool_result", tool_use_id: block.id, content: await runBrief(input, cr) });
        }
        messages.push({ role: "user", content: results });
      }
    }
    await recordUsage(me, tokens);
    if (answer.trim()) {
      await saveThread(me.id, {
        id: threadId,
        cards: asked.cards,
        messages: [...asked.plain, { role: "assistant", content: answer }],
      });
    }
    send({ type: "done", remaining });
  } catch (err) {
    if (!answered) await refundRuling(me);
    if (tokens.input) await recordUsage(me, tokens);
    console.error("judge error:", err);
    const message =
      err instanceof Anthropic.APIError
        ? `The judge couldn't answer (${err.status ?? "network"}). Try again in a moment.`
        : err instanceof Error
          ? err.message
          : String(err);
    if (!abort.signal.aborted) send({ type: "error", message });
  } finally {
    res.end();
  }
}

/**
 * Local testing without an API key (scripts/dev-api.ts only): runs the real
 * card and rules lookups, then writes a canned answer from what they returned.
 */
async function fakeJudge(history: MessageParam[], cr: Cr | null, send: (e: Record<string, unknown>) => void) {
  const q = String(history[history.length - 1].content);
  const cards = q.match(/^Cards on the table: (.*)$/m)?.[1].split("; ") ?? [];
  const input: BriefInput = { cards, search: q.replace(/^Cards on the table:.*$/m, "").slice(0, 60) };
  send({ type: "text", delta: "(preamble that should disappear)" });
  send({ type: "reset" });
  send({ type: "status", text: describe(input) });
  const found = await runBrief(input, cr);
  const firstRule = found.match(/^\s+(\d{3}\.\d+[a-z]?)\s/m)?.[1];
  const answer = `**Ruling:** This is the local stand-in judge (no API key here), so this isn't a real ruling.\n\n**Why:**\n1. Looked up ${cards.length ? cards.join(", ") : "no cards"}.\n2. The rules search's top hit was ${firstRule ? `CR ${firstRule}` : "nothing"}.\n\n**Sources:** CR effective ${cr?.effective ?? "unknown"}.`;
  for (const piece of answer.match(/.{1,24}/gs) ?? []) {
    send({ type: "text", delta: piece });
    await new Promise((r) => setTimeout(r, 15));
  }
}
