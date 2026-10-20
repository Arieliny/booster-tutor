/**
 * Talking to the judge (api/judge.ts). The open conversation is kept on this
 * device; each question sends it whole and streams the answer back. After each
 * answer the server saves the thread to the person's history (last 50, synced
 * across their devices); a copy is kept here so past rulings can be reread
 * offline.
 */

export interface JudgeMessage {
  role: "user" | "assistant";
  content: string;
  /** Answers only, and only for the owner: what it cost, estimated US dollars. */
  cost?: number;
}

/** "≈ 7.4¢" under a dollar, "≈ $1.23" over. */
export function formatCost(dollars: number): string {
  return dollars < 1 ? `≈ ${(dollars * 100).toFixed(1)}¢` : `≈ $${dollars.toFixed(2)}`;
}

/** This month's rulings. */
export interface Allowance {
  remaining: number | null; // null = unlimited
  limit: number | null;
  cr: string | null; // Comprehensive Rules effective date
}

export type JudgeEvent =
  | { type: "thread"; id: string }
  | { type: "status"; text: string }
  | { type: "text"; delta: string }
  | { type: "reset" }
  | { type: "done"; remaining: number | null; refused?: boolean; cost?: number }
  | { type: "error"; message: string };

export interface Conversation {
  messages: JudgeMessage[];
  cards: string[];
  /** The history thread this conversation continues; unset until the first answer. */
  threadId?: string;
}

const CONVO_KEY = "booster-tutor-judge-v1";

export function loadConversation(): Conversation {
  try {
    const s = localStorage.getItem(CONVO_KEY);
    const v = s ? (JSON.parse(s) as Partial<Conversation>) : {};
    return { messages: v.messages ?? [], cards: v.cards ?? [], threadId: v.threadId };
  } catch {
    return { messages: [], cards: [] };
  }
}

export function saveConversation(c: Conversation): void {
  try {
    localStorage.setItem(CONVO_KEY, JSON.stringify(c));
  } catch {
    // Blocked storage: the conversation still works until the page closes.
  }
}

/** Set by startQuestionAbout: the next Judge to open takes that card instead of a blank question. */
let cardHandOff = false;

/** Start a fresh question with this card on the table (the Judge screen picks it up when it opens). */
export function startQuestionAbout(cardName: string): void {
  saveConversation({ messages: [], cards: [cardName] });
  cardHandOff = true;
}

/**
 * What a Judge shows when it opens: always a blank question (answered ones
 * are in the history), unless it was opened by "Ask the judge about this
 * card", which brings that card along. Pure, so it's safe as a state
 * initializer; the Judge calls tookHandOff() once it has opened.
 */
export function openingConversation(): Conversation {
  return cardHandOff ? loadConversation() : { messages: [], cards: [] };
}

export function tookHandOff(): void {
  cardHandOff = false;
}

export async function getAllowance(): Promise<Allowance> {
  const res = await fetch("/api/judge", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Allowance;
}

/** Ask a question; events arrive through onEvent as the answer is written. */
export async function askJudge(c: Conversation, onEvent: (e: JudgeEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch("/api/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: c.messages, cards: c.cards, threadId: c.threadId }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    onEvent({ type: "error", message: body?.error ?? `The judge couldn't be reached (HTTP ${res.status}).` });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as JudgeEvent);
    }
  }
}

// ---------------------------------------------------------------- history

export interface ThreadSummary {
  id: string;
  title: string;
  cards: string[];
  updatedAt: string;
  questions: number;
}

interface Thread {
  id: string;
  cards: string[];
  messages: JudgeMessage[];
}

const HISTORY_KEY = "booster-tutor-judge-history-v1";
type HistoryCache = { threads: ThreadSummary[]; bodies: Record<string, Thread> };

function readHistoryCache(): HistoryCache {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "{}") as Partial<HistoryCache>;
    return { threads: v.threads ?? [], bodies: v.bodies ?? {} };
  } catch {
    return { threads: [], bodies: {} };
  }
}

function writeHistoryCache(c: HistoryCache): void {
  // Only threads still in the history are worth keeping.
  const ids = new Set(c.threads.map((t) => t.id));
  const bodies = Object.fromEntries(Object.entries(c.bodies).filter(([id]) => ids.has(id)));
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ threads: c.threads, bodies }));
  } catch {
    // Storage full: history still works online.
  }
}

/** What this device last saw, for showing instantly and offline. */
export function cachedHistory(): ThreadSummary[] {
  return readHistoryCache().threads;
}

export async function fetchHistory(): Promise<ThreadSummary[]> {
  const res = await fetch("/api/judge?history=1", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { threads } = (await res.json()) as { threads: ThreadSummary[] };
  writeHistoryCache({ ...readHistoryCache(), threads });
  return threads;
}

/** One past thread: from the server when online, else this device's copy. */
export async function openThread(id: string): Promise<Conversation> {
  const cache = readHistoryCache();
  try {
    const res = await fetch(`/api/judge?thread=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (res.status === 404) throw new Error("That thread isn't in your history any more.");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { thread } = (await res.json()) as { thread: Thread };
    writeHistoryCache({ ...cache, bodies: { ...cache.bodies, [id]: thread } });
    return { messages: thread.messages, cards: thread.cards, threadId: id };
  } catch (err) {
    const saved = cache.bodies[id];
    if (saved && !(err instanceof Error && err.message.includes("any more"))) {
      return { messages: saved.messages, cards: saved.cards, threadId: id };
    }
    throw err;
  }
}

/** Keep this device's copy of the open thread current (so it reads offline). */
export function rememberThread(c: Conversation): void {
  if (!c.threadId) return;
  const cache = readHistoryCache();
  const firstQuestion = c.messages.find((m) => m.role === "user")?.content ?? "";
  const summary: ThreadSummary = {
    id: c.threadId,
    title: firstQuestion.replace(/\s+/g, " ").trim().slice(0, 120),
    cards: c.cards,
    updatedAt: new Date().toISOString(),
    questions: c.messages.filter((m) => m.role === "user").length,
  };
  writeHistoryCache({
    threads: [summary, ...cache.threads.filter((t) => t.id !== c.threadId)].slice(0, 50),
    bodies: { ...cache.bodies, [c.threadId]: { id: c.threadId, cards: c.cards, messages: c.messages } },
  });
}

export async function deleteThread(id: string): Promise<void> {
  const res = await fetch("/api/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "deleteThread", id }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cache = readHistoryCache();
  writeHistoryCache({ ...cache, threads: cache.threads.filter((t) => t.id !== id) });
}

export async function clearHistory(): Promise<void> {
  const res = await fetch("/api/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "clearHistory" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  writeHistoryCache({ threads: [], bodies: {} });
}

/** Card-name suggestions from Scryfall, for adding cards to a question. */
export async function suggestCards(q: string, signal: AbortSignal): Promise<string[]> {
  const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { data: string[] }).data.slice(0, 12);
}
