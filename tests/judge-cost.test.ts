import { describe, expect, it } from "vitest";
import { WEB_SEARCH_DOLLARS, dollarsFor, tokensOf } from "../api/_judge-cost";

describe("dollarsFor", () => {
  it("prices an Opus 5.5 ruling with a web search", () => {
    // 9000*$4 + 2500*$20 + 12000*$0.20 + 4000*$5 per million = $0.1084, + 1 search at $0.01
    const d = dollarsFor("claude-opus-5-5", { input: 9000, output: 2500, cacheRead: 12000, cacheWrite: 4000 }, 1);
    expect(d).toBeCloseTo(0.1184, 6);
  });

  it("prices the Haiku gatekeeper", () => {
    // 450*$0.10 + 2*$0.50 per million = $0.000046
    expect(dollarsFor("claude-haiku-5-5", { input: 450, output: 2, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(0.000046, 9);
  });

  it("is free for zero usage", () => {
    expect(dollarsFor("claude-opus-5-5", { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })).toBe(0);
  });

  it("prices each token class at its own rate (Opus, one million of each)", () => {
    const one = (k: "input" | "output" | "cacheRead" | "cacheWrite") =>
      dollarsFor("claude-opus-5-5", { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, [k]: 1_000_000 });
    expect(one("input")).toBeCloseTo(4, 9);
    expect(one("output")).toBeCloseTo(20, 9);
    expect(one("cacheRead")).toBeCloseTo(0.2, 9);
    expect(one("cacheWrite")).toBeCloseTo(5, 9);
  });

  it("adds a flat cent per web search, independent of tokens", () => {
    const none = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    expect(WEB_SEARCH_DOLLARS).toBe(0.01);
    expect(dollarsFor("claude-opus-5-5", none, 3)).toBeCloseTo(0.03, 9);
  });
});

describe("tokensOf", () => {
  it("maps SDK usage, defaulting missing cache counts to 0", () => {
    const usage = { input_tokens: 10, output_tokens: 20 } as Parameters<typeof tokensOf>[0];
    expect(tokensOf(usage)).toEqual({ input: 10, output: 20, cacheRead: 0, cacheWrite: 0 });
    const withCache = { ...usage, cache_read_input_tokens: 5, cache_creation_input_tokens: 7 } as Parameters<typeof tokensOf>[0];
    expect(tokensOf(withCache)).toEqual({ input: 10, output: 20, cacheRead: 5, cacheWrite: 7 });
  });
});
