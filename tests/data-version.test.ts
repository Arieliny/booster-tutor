import { describe, expect, it } from "vitest";
import { MAX_AGE_DAYS, staleReasons } from "../api/_data-version";
import { isNewer, networkAllows } from "../src/lib/card-db";

const now = new Date("2026-11-13T09:00:00Z");
const built = {
  builtAt: "2026-11-10T09:00:00Z",
  cards: { builtAt: "2026-11-10T08:58:00Z", count: 34045, total: 34045 },
  cr: { source: "https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt", effective: "September 25, 2026" },
};
const same = { total: 34045, crSource: built.cr.source };

describe("staleReasons", () => {
  it("is current when nothing changed", () => {
    expect(staleReasons(built, same, now)).toEqual([]);
  });

  it("rebuilds for new Comprehensive Rules", () => {
    const r = staleReasons(built, { ...same, crSource: "https://media.wizards.com/2026/downloads/MagicCompRules%2020261113.txt" }, now);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/Comprehensive Rules/);
  });

  it("rebuilds when Scryfall's card count moves (new previews)", () => {
    expect(staleReasons(built, { ...same, total: 34120 }, now)[0]).toMatch(/34120/);
  });

  it("never rebuilds because a source couldn't be reached", () => {
    expect(staleReasons(built, { total: null, crSource: null }, now)).toEqual([]);
  });

  it("rebuilds an old build, a build missing its data, and a deploy with no version file", () => {
    const old = new Date(Date.parse(built.builtAt) + (MAX_AGE_DAYS + 1) * 86_400_000);
    expect(staleReasons(built, same, old)[0]).toMatch(/days ago/);
    expect(staleReasons({ ...built, cards: null, cr: null }, same, now)).toHaveLength(2);
    expect(staleReasons(null, same, now)).toHaveLength(1);
  });
});

describe("isNewer", () => {
  it("compares the deployed database's build time with this device's", () => {
    expect(isNewer("2026-11-12T08:00:00Z", "2026-11-10T08:00:00Z")).toBe(true);
    expect(isNewer("2026-11-10T08:00:00Z", "2026-11-10T08:00:00Z")).toBe(false);
    expect(isNewer(undefined, "2026-11-10T08:00:00Z")).toBe(false);
    // An unknown local build time (info lost) counts as old.
    expect(isNewer("2026-11-10T08:00:00Z", "")).toBe(true);
  });
});

describe("networkAllows", () => {
  it("Wi-Fi only: downloads on Wi-Fi and wired, never on mobile data", () => {
    expect(networkAllows(true, "wifi", true)).toBe(true);
    expect(networkAllows(true, "ethernet", false)).toBe(true);
    expect(networkAllows(true, "cellular", true)).toBe(false);
    expect(networkAllows(true, "cellular", false)).toBe(false);
  });

  it("Wi-Fi only, browser won't say: a phone waits, a computer goes ahead", () => {
    expect(networkAllows(true, undefined, true)).toBe(false);
    expect(networkAllows(true, "unknown", true)).toBe(false);
    expect(networkAllows(true, undefined, false)).toBe(true);
  });

  it("switched off: any connection", () => {
    expect(networkAllows(false, "cellular", true)).toBe(true);
    expect(networkAllows(false, undefined, true)).toBe(true);
  });
});
