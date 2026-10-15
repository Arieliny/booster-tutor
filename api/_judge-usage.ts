import { redis } from "./_redis.js";
import type { User } from "./_auth.js";
import { WEB_SEARCH_DOLLARS, dollarsFor, type TokenCounts } from "./_judge-cost.js";

/**
 * Monthly ruling limits and usage for the judge. Every ruling is billed to the
 * owner's Anthropic API key, so guests get a monthly allowance (set per person
 * in Admin); the owner is unlimited. Months are UTC calendar months.
 *
 * Keys: judge:month:{userId}:{YYYY-MM}  INT   rulings asked that month (the limit counts these)
 *       judge:usage:{userId}:{YYYY-MM}  HASH  the judge's input / output / cacheRead / cacheWrite tokens,
 *                                             web searches, and guardMicros (the gatekeeper's cost, millionths of a dollar)
 */

export const DEFAULT_GUEST_LIMIT = 50;

const month = () => new Date().toISOString().slice(0, 7);
const countKey = (id: string, m = month()) => `judge:month:${id}:${m}`;
const usageKey = (id: string, m = month()) => `judge:usage:${id}:${m}`;
const KEEP = 400 * 24 * 60 * 60;

/** null = unlimited. */
export function limitFor(u: User): number | null {
  return u.role === "owner" ? null : (u.judgeLimit ?? DEFAULT_GUEST_LIMIT);
}

export async function usedThisMonth(id: string): Promise<number> {
  return Number((await redis.get<number>(countKey(id))) ?? 0);
}

/** Take one ruling from this month's allowance. Returns what's left (null = unlimited), or false if none. */
export async function claimRuling(u: User): Promise<number | null | false> {
  const key = countKey(u.id);
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, KEEP);
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
  await redis.decr(countKey(u.id));
}

export type TokenUsage = TokenCounts;

/** The judge's tokens and web searches for one ruling. */
export async function recordUsage(u: User, t: TokenUsage, searches: number): Promise<void> {
  const key = usageKey(u.id);
  await Promise.all([
    redis.hincrby(key, "input", t.input),
    redis.hincrby(key, "output", t.output),
    redis.hincrby(key, "cacheRead", t.cacheRead),
    redis.hincrby(key, "cacheWrite", t.cacheWrite),
    searches ? redis.hincrby(key, "searches", searches) : null,
  ]);
  await redis.expire(key, KEEP);
}

/** The gatekeeper's cost for one question (also charged when it refuses). */
export async function recordGuard(u: User, dollars: number): Promise<void> {
  const micros = Math.round(dollars * 1e6);
  if (!micros) return;
  const key = usageKey(u.id);
  await redis.hincrby(key, "guardMicros", micros);
  await redis.expire(key, KEEP);
}

export interface JudgeUsage {
  /** Rulings this month. */
  used: number;
  limit: number | null;
  tokens: TokenUsage;
  searches: number;
  /** Estimated spend this month, US dollars (judge + web searches + gatekeeper). */
  dollars: number;
}

export async function usageFor(u: User): Promise<JudgeUsage> {
  const [used, m] = await Promise.all([usedThisMonth(u.id), redis.hgetall<Record<string, number>>(usageKey(u.id))]);
  const n = (k: string) => Number(m?.[k] ?? 0);
  const tokens = { input: n("input"), output: n("output"), cacheRead: n("cacheRead"), cacheWrite: n("cacheWrite") };
  const searches = n("searches");
  return {
    used,
    limit: limitFor(u),
    tokens,
    searches,
    dollars: dollarsFor("claude-opus-5-5", tokens) + searches * WEB_SEARCH_DOLLARS + n("guardMicros") / 1e6,
  };
}
