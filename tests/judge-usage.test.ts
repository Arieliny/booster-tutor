import { beforeAll, describe, expect, it } from "vitest";
import type { User } from "../api/_auth";

// _redis.ts picks the in-memory fake at import time, so set the flag first and
// import dynamically (same trick as scripts/check-judge-guard.ts).
let usage: typeof import("../api/_judge-usage");

beforeAll(async () => {
  process.env.BT_FAKE_REDIS = "1";
  usage = await import("../api/_judge-usage");
});

// The fake Redis is shared by the whole file, so every test uses its own user id.
let seq = 0;
function user(over: Partial<User> = {}): User {
  seq++;
  return { id: `u${seq}`, name: `User ${seq}`, role: "guest", features: ["judge"], createdAt: "2026-01-01T00:00:00.000Z", ...over };
}

describe("limitFor", () => {
  it("gives guests 50 rulings a month by default", () => {
    expect(usage.DEFAULT_GUEST_LIMIT).toBe(50);
    expect(usage.limitFor(user())).toBe(50);
  });

  it("honours a per-person judgeLimit, including 0", () => {
    expect(usage.limitFor(user({ judgeLimit: 120 }))).toBe(120);
    expect(usage.limitFor(user({ judgeLimit: 0 }))).toBe(0);
  });

  it("is unlimited (null) for the owner, even with a judgeLimit set", () => {
    expect(usage.limitFor(user({ role: "owner" }))).toBeNull();
    expect(usage.limitFor(user({ role: "owner", judgeLimit: 3 }))).toBeNull();
  });
});

describe("claimRuling / refundRuling", () => {
  it("counts down what's left and refuses once the allowance is used up", async () => {
    const u = user({ judgeLimit: 3 });
    expect(await usage.claimRuling(u)).toBe(2);
    expect(await usage.claimRuling(u)).toBe(1);
    expect(await usage.claimRuling(u)).toBe(0);
    expect(await usage.claimRuling(u)).toBe(false);
    expect(await usage.usedThisMonth(u.id)).toBe(3);
  });

  it("doesn't consume anything when it refuses (repeated refusals leave the count at the limit)", async () => {
    const u = user({ judgeLimit: 1 });
    expect(await usage.claimRuling(u)).toBe(0);
    for (let i = 0; i < 5; i++) expect(await usage.claimRuling(u)).toBe(false);
    expect(await usage.usedThisMonth(u.id)).toBe(1);
  });

  it("refunding gives one ruling back, so the next claim succeeds", async () => {
    const u = user({ judgeLimit: 1 });
    await usage.claimRuling(u);
    expect(await usage.claimRuling(u)).toBe(false);
    await usage.refundRuling(u);
    expect(await usage.usedThisMonth(u.id)).toBe(0);
    expect(await usage.claimRuling(u)).toBe(0);
  });

  it("a guest at the default limit gets exactly 50 rulings", async () => {
    const u = user();
    let granted = 0;
    for (let i = 0; i < 55; i++) if ((await usage.claimRuling(u)) !== false) granted++;
    expect(granted).toBe(50);
  });

  it("a guest with limit 0 can never ask", async () => {
    const u = user({ judgeLimit: 0 });
    expect(await usage.claimRuling(u)).toBe(false);
    expect(await usage.usedThisMonth(u.id)).toBe(0);
  });

  it("the owner is never refused and gets null (unlimited) back", async () => {
    const owner = user({ role: "owner", features: ["play", "setReview", "judge"] });
    for (let i = 0; i < 60; i++) expect(await usage.claimRuling(owner)).toBeNull();
    expect(await usage.usedThisMonth(owner.id)).toBe(60);
  });

  it("tracks each person separately", async () => {
    const a = user({ judgeLimit: 1 });
    const b = user({ judgeLimit: 1 });
    await usage.claimRuling(a);
    expect(await usage.claimRuling(a)).toBe(false);
    expect(await usage.claimRuling(b)).toBe(0);
  });
});

describe("usageFor", () => {
  const tokens = { input: 9000, output: 2500, cacheRead: 12000, cacheWrite: 4000 };

  it("is all zeros for someone who has never asked", async () => {
    const u = user();
    expect(await usage.usageFor(u)).toEqual({
      used: 0,
      limit: 50,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      searches: 0,
      dollars: 0,
    });
  });

  it("reports rulings used, the limit, and tokens/searches recorded", async () => {
    const u = user({ judgeLimit: 10 });
    await usage.claimRuling(u);
    await usage.recordUsage(u, tokens, 1);
    const r = await usage.usageFor(u);
    expect(r.used).toBe(1);
    expect(r.limit).toBe(10);
    expect(r.tokens).toEqual(tokens);
    expect(r.searches).toBe(1);
  });

  it("prices Opus tokens + searches x $0.01 + the gatekeeper's cost", async () => {
    const u = user();
    await usage.recordUsage(u, tokens, 1); // $0.1084 tokens + $0.01 search = $0.1184
    await usage.recordGuard(u, 0.000046); // 46 micro-dollars
    expect((await usage.usageFor(u)).dollars).toBeCloseTo(0.1184 + 0.000046, 8);
  });

  it("accumulates across several rulings", async () => {
    const u = user();
    await usage.recordUsage(u, tokens, 1);
    await usage.recordUsage(u, tokens, 0);
    await usage.recordUsage(u, tokens, 2);
    const r = await usage.usageFor(u);
    expect(r.tokens).toEqual({ input: 27000, output: 7500, cacheRead: 36000, cacheWrite: 12000 });
    expect(r.searches).toBe(3);
    expect(r.dollars).toBeCloseTo(0.1084 * 3 + 0.03, 8);
  });

  it("reports a null limit for the owner", async () => {
    expect((await usage.usageFor(user({ role: "owner" }))).limit).toBeNull();
  });
});

describe("recordGuard", () => {
  it("ignores a zero cost and rounds to whole micro-dollars", async () => {
    const u = user();
    await usage.recordGuard(u, 0);
    expect((await usage.usageFor(u)).dollars).toBe(0);
    await usage.recordGuard(u, 0.0000004); // rounds to 0 micros -> ignored
    expect((await usage.usageFor(u)).dollars).toBe(0);
    await usage.recordGuard(u, 0.000012);
    await usage.recordGuard(u, 0.000012);
    expect((await usage.usageFor(u)).dollars).toBeCloseTo(0.000024, 9);
  });

  it("is charged even when no ruling was ever claimed (a refused off-topic question)", async () => {
    const u = user();
    await usage.recordGuard(u, 0.0001);
    const r = await usage.usageFor(u);
    expect(r.used).toBe(0);
    expect(r.dollars).toBeCloseTo(0.0001, 9);
  });
});
