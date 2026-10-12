import { redis } from "./_redis.js";
import type { User } from "./_auth.js";

/**
 * Daily ruling limits and usage for the judge. Every ruling is billed to the
 * owner's Anthropic API key, so guests get a daily allowance (set per person
 * in Admin); the owner is unlimited. Days are UTC.
 *
 * Keys: judge:day:{userId}:{YYYY-MM-DD}  INT   rulings asked that day
 *       judge:usage:{userId}:{YYYY-MM}   HASH  rulings / input / output / cacheRead / cacheWrite tokens
 */

export const DEFAULT_GUEST_LIMIT = 20;

const today = () => new Date().toISOString().slice(0, 10);
const month = () => new Date().toISOString().slice(0, 7);
const dayKey = (id: string, d = today()) => `judge:day:${id}:${d}`;
const usageKey = (id: string, m = month()) => `judge:usage:${id}:${m}`;

/** null = unlimited. */
export function limitFor(u: User): number | null {
  return u.role === "owner" ? null : (u.judgeLimit ?? DEFAULT_GUEST_LIMIT);
}

export async function usedToday(id: string): Promise<number> {
  return Number((await redis.get<number>(dayKey(id))) ?? 0);
}

/** Take one ruling from today's allowance. Returns what's left (null = unlimited), or false if none. */
export async function claimRuling(u: User): Promise<number | null | false> {
  const key = dayKey(u.id);
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 2 * 24 * 60 * 60);
  const limit = limitFor(u);
  if (limit === null) return null;
  if (n > limit) {
    await redis.decr(key);
    return false;
  }
  return limit - n;
}

/** Give a ruling back when it failed before answering. */
export async function refundRuling(u: User): Promise<void> {
  await redis.decr(dayKey(u.id));
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export async function recordUsage(u: User, t: TokenUsage): Promise<void> {
  const key = usageKey(u.id);
  await Promise.all([
    redis.hincrby(key, "rulings", 1),
    redis.hincrby(key, "input", t.input),
    redis.hincrby(key, "output", t.output),
    redis.hincrby(key, "cacheRead", t.cacheRead),
    redis.hincrby(key, "cacheWrite", t.cacheWrite),
  ]);
  await redis.expire(key, 400 * 24 * 60 * 60);
}

export interface JudgeUsage {
  today: number;
  limit: number | null;
  month: { rulings: number } & TokenUsage;
}

export async function usageFor(u: User): Promise<JudgeUsage> {
  const [t, m] = await Promise.all([usedToday(u.id), redis.hgetall<Record<string, number>>(usageKey(u.id))]);
  const n = (k: string) => Number(m?.[k] ?? 0);
  return {
    today: t,
    limit: limitFor(u),
    month: { rulings: n("rulings"), input: n("input"), output: n("output"), cacheRead: n("cacheRead"), cacheWrite: n("cacheWrite") },
  };
}
