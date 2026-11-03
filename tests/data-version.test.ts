import { describe, expect, it } from "vitest";
import { MAX_AGE_DAYS, staleReasons } from "../api/_data-version";
import { splitParts } from "../scripts/lib/card-db-parts.mjs";
import { hasUpdate, networkAllows, planUpdate, sizeLabel, type DbIndex } from "../src/lib/card-db";

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

describe("hasUpdate", () => {
  it("compares the cards, not when they were built", () => {
    expect(hasUpdate("46e70a05f384", "a29660e9afca")).toBe(true);
    expect(hasUpdate("46e70a05f384", "46e70a05f384")).toBe(false);
    expect(hasUpdate(undefined, "46e70a05f384")).toBe(false);
    // The old one-file database has no version: any site version updates it.
    expect(hasUpdate("46e70a05f384", "")).toBe(true);
  });
});

describe("splitParts", () => {
  const card = (id: string, n: string) => ({ id, n });
  const month: Record<string, string> = { a1: "1993-08", a2: "1993-08", b1: "2026-11", c1: "nonsense!" };
  const split = (cards: { id: string; n: string }[]) => splitParts(cards, (c: { id: string }) => month[c.id]);

  it("groups by month, with anything unknown in 'other'", () => {
    const { parts } = split([card("b1", "New"), card("a2", "Two"), card("a1", "One"), card("c1", "Odd")]);
    expect(parts.map((p) => [p.key, p.count])).toEqual([
      ["1993-08", 2],
      ["2026-11", 1],
      ["other", 1],
    ]);
  });

  it("the same cards in any order make the same files; a change renames only its part", () => {
    const a = split([card("a1", "One"), card("a2", "Two"), card("b1", "New")]);
    const b = split([card("b1", "New"), card("a2", "Two"), card("a1", "One")]);
    expect(b.parts).toEqual(a.parts);
    expect(b.version).toBe(a.version);
    const errata = split([card("a1", "One"), card("a2", "Two"), card("b1", "Newer")]);
    expect(errata.parts[0].file).toBe(a.parts[0].file);
    expect(errata.parts[1].file).not.toBe(a.parts[1].file);
    expect(errata.version).not.toBe(a.version);
  });
});

describe("planUpdate", () => {
  const site: DbIndex = {
    builtAt: "2026-11-10T08:00:00Z",
    count: 3,
    version: "v2",
    parts: [
      { key: "1993-08", file: "1993-08-aaa.json", count: 2, gz: 50_000 },
      { key: "2026-11", file: "2026-11-ccc.json", count: 1, gz: 30_000 },
    ],
  };

  it("downloads only the parts this device lacks", () => {
    const plan = planUpdate(site, new Set(["1993-08-aaa.json", "2026-11-bbb.json"]));
    expect(plan.missing.map((p) => p.key)).toEqual(["2026-11"]);
    expect(plan.bytes).toBe(30_000);
  });

  it("everything on a first download, nothing when current", () => {
    expect(planUpdate(site, new Set()).bytes).toBe(80_000);
    expect(planUpdate(site, new Set(["1993-08-aaa.json", "2026-11-ccc.json"])).missing).toEqual([]);
  });
});

describe("sizeLabel", () => {
  it("reads like the size a phone shows", () => {
    expect(sizeLabel(3_000)).toBe("~10 KB");
    expect(sizeLabel(53_346)).toBe("~50 KB");
    expect(sizeLabel(221_000)).toBe("~220 KB");
    expect(sizeLabel(3_808_000)).toBe("~3.8 MB");
    expect(sizeLabel(12_300_000)).toBe("~12 MB");
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
