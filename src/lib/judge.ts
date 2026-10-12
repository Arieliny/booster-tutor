/**
 * Talking to the judge (api/judge.ts). The conversation is kept on this
 * device only; each question sends it whole and streams the answer back.
 */

export interface JudgeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Allowance {
  remaining: number | null; // null = unlimited
  limit: number | null;
  cr: string | null; // Comprehensive Rules effective date
}

export type JudgeEvent =
  | { type: "status"; text: string }
  | { type: "text"; delta: string }
  | { type: "reset" }
  | { type: "done"; remaining: number | null }
  | { type: "error"; message: string };

const CONVO_KEY = "booster-tutor-judge-v1";

export function loadConversation(): { messages: JudgeMessage[]; cards: string[] } {
  try {
    const s = localStorage.getItem(CONVO_KEY);
    const v = s ? (JSON.parse(s) as { messages?: JudgeMessage[]; cards?: string[] }) : {};
    return { messages: v.messages ?? [], cards: v.cards ?? [] };
  } catch {
    return { messages: [], cards: [] };
  }
}

export function saveConversation(messages: JudgeMessage[], cards: string[]): void {
  try {
    localStorage.setItem(CONVO_KEY, JSON.stringify({ messages, cards }));
  } catch {
    // Blocked storage: the conversation still works until the page closes.
  }
}

export async function getAllowance(): Promise<Allowance> {
  const res = await fetch("/api/judge", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Allowance;
}

/** Ask a question; events arrive through onEvent as the answer is written. */
export async function askJudge(
  messages: JudgeMessage[],
  cards: string[],
  onEvent: (e: JudgeEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, cards }),
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

/** Card-name suggestions from Scryfall, for adding cards to a question. */
export async function suggestCards(q: string, signal: AbortSignal): Promise<string[]> {
  const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { data: string[] }).data.slice(0, 12);
}
