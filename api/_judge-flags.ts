import { redis } from "./_redis.js";
import type { ThreadMessage } from "./_judge-history.js";

/**
 * Rulings someone thought looked wrong ("Looks wrong?" under an answer). Each
 * flag keeps the conversation up to that answer, so the owner can check it and
 * turn it into a judge test question (tests/judge-eval/). Only the owner can
 * read them (Admin); flagging is the person choosing to share that one thread.
 *
 * Keys: judge:flags                 HASH  flagId -> Flag
 *       judge:flagged:{uid}:{date}  NUM   flags sent today (a daily cap)
 */

export const MAX_FLAGS = 200;
export const DAILY_FLAGS = 20;
const MAX_MESSAGES = 12;
const MAX_CHARS = 6000;

export interface Flag {
  id: string;
  at: string;
  userId: string;
  userName: string;
  cards: string[];
  /** The conversation, ending with the flagged answer. */
  messages: ThreadMessage[];
  note: string;
}

const KEY = "judge:flags";
const dayKey = (uid: string) => `judge:flagged:${uid}:${new Date().toISOString().slice(0, 10)}`;

/** The flag as sent, checked and trimmed; null when it doesn't end with an answer. */
export function readFlag(body: Record<string, unknown>): Pick<Flag, "cards" | "messages" | "note"> | null {
  if (!Array.isArray(body.messages)) return null;
  const messages = body.messages
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && !!m.content.trim(),
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (messages.at(-1)?.role !== "assistant" || !messages.some((m) => m.role === "user")) return null;
  const cards = Array.isArray(body.cards) ? body.cards.filter((c): c is string => typeof c === "string").slice(0, 10) : [];
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  return { cards, messages, note };
}

/** Save a flag; false when the person has sent today's maximum. */
export async function saveFlag(user: { id: string; name: string }, flag: Pick<Flag, "cards" | "messages" | "note">): Promise<boolean> {
  const n = await redis.incr(dayKey(user.id));
  if (n === 1) await redis.expire(dayKey(user.id), 2 * 24 * 60 * 60);
  if (n > DAILY_FLAGS) return false;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  await redis.hset(KEY, { [id]: { id, at: new Date().toISOString(), userId: user.id, userName: user.name, ...flag } satisfies Flag });
  // Keep the newest MAX_FLAGS.
  const all = await listFlags();
  const old = all.slice(MAX_FLAGS).map((f) => f.id);
  if (old.length) await redis.hdel(KEY, ...old);
  return true;
}

/** Newest first. */
export async function listFlags(): Promise<Flag[]> {
  const all = (await redis.hgetall<Record<string, Flag>>(KEY)) ?? {};
  return Object.values(all)
    .filter((f) => f && typeof f === "object")
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export async function deleteFlag(id: string): Promise<void> {
  await redis.hdel(KEY, id);
}
