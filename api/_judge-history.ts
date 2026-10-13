import { redis } from "./_redis.js";

/**
 * Each person's judge history: their last 50 question threads, stored on the
 * server so they follow the person across devices. Only that person can read
 * their own history (the owner can't see guests').
 *
 * Keys: judge:threads:{userId}     HASH  threadId -> Thread
 *       judge:threadlist:{userId}  JSON  ThreadSummary[], newest first (the index)
 */

export const MAX_THREADS = 50;
const MAX_MESSAGES = 30;

export interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Thread {
  id: string;
  cards: string[];
  messages: ThreadMessage[];
}

export interface ThreadSummary {
  id: string;
  title: string;
  cards: string[];
  updatedAt: string;
  /** Questions asked in the thread. */
  questions: number;
}

const threadsKey = (uid: string) => `judge:threads:${uid}`;
const listKey = (uid: string) => `judge:threadlist:${uid}`;

export function newThreadId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function isThreadId(x: unknown): x is string {
  return typeof x === "string" && /^[a-z0-9]{6,24}$/.test(x);
}

export async function listThreads(uid: string): Promise<ThreadSummary[]> {
  return (await redis.get<ThreadSummary[]>(listKey(uid))) ?? [];
}

export async function getThread(uid: string, id: string): Promise<Thread | null> {
  return (await redis.hget<Thread>(threadsKey(uid), id)) ?? null;
}

/** Save a thread after an answer, move it to the top, and drop the oldest past 50. */
export async function saveThread(uid: string, thread: Thread): Promise<void> {
  const messages = thread.messages.slice(-MAX_MESSAGES);
  const firstQuestion = messages.find((m) => m.role === "user")?.content ?? "";
  const summary: ThreadSummary = {
    id: thread.id,
    title: firstQuestion.replace(/\s+/g, " ").trim().slice(0, 120),
    cards: thread.cards,
    updatedAt: new Date().toISOString(),
    questions: messages.filter((m) => m.role === "user").length,
  };
  const list = [summary, ...(await listThreads(uid)).filter((t) => t.id !== thread.id)];
  const dropped = list.slice(MAX_THREADS);
  await redis.hset(threadsKey(uid), { [thread.id]: { ...thread, messages } });
  await redis.set(listKey(uid), list.slice(0, MAX_THREADS));
  if (dropped.length) await redis.hdel(threadsKey(uid), ...dropped.map((t) => t.id));
}

export async function deleteThread(uid: string, id: string): Promise<void> {
  await redis.set(
    listKey(uid),
    (await listThreads(uid)).filter((t) => t.id !== id),
  );
  await redis.hdel(threadsKey(uid), id);
}

export async function clearHistory(uid: string): Promise<void> {
  await redis.del(threadsKey(uid), listKey(uid));
}
