import { describe, expect, it } from "vitest";
import { CARD_COUNTERS, DEFAULT_SETTINGS, TRACKERS, parseSettings } from "../src/lib/life-settings";

describe("life counter settings", () => {
  it("defaults to every tracker shown", () => {
    for (const t of TRACKERS) expect(DEFAULT_SETTINGS.show[t.key]).toBe(true);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("junk")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps what was saved and fills in the rest", () => {
    const s = parseSettings({ show: { dungeons: false, dayNight: false, nonsense: false, ring: "no" }, customLife: 25 });
    expect(s.show.dungeons).toBe(false);
    expect(s.show.dayNight).toBe(false);
    expect(s.show.ring).toBe(true);
    expect(s.show.cmdr).toBe(true);
    expect(s.customLife).toBe(25);
    expect("nonsense" in s.show).toBe(false);
  });

  it("offers the common counters until switched otherwise", () => {
    const keys = CARD_COUNTERS.map((c) => c.key);
    expect(keys).toContain("custom1");
    expect(keys).not.toContain("ticket");
    expect(keys.some((k) => k.startsWith("mana"))).toBe(false);
    expect(keys.filter((k) => DEFAULT_SETTINGS.cardCounters[k])).toEqual(["poison", "energy", "tax", "storm", "custom1", "custom2"]);
    for (const k of keys) expect(typeof DEFAULT_SETTINGS.cardCounters[k]).toBe("boolean");
    const s = parseSettings({ cardCounters: { speed: true, poison: false, energy: "no", manaW: false, ticket: true } });
    expect(s.cardCounters.speed).toBe(true);
    expect("ticket" in s.cardCounters).toBe(false);
    expect(s.cardCounters.poison).toBe(false);
    expect(s.cardCounters.energy).toBe(true);
    expect("manaW" in s.cardCounters).toBe(false);
    // Settings saved before counters existed, or by the first version (every counter on).
    expect(parseSettings({ show: { ring: false } }).cardCounters).toEqual(DEFAULT_SETTINGS.cardCounters);
    expect(parseSettings({ counters: { ticket: true } }).cardCounters).toEqual(DEFAULT_SETTINGS.cardCounters);
  });

  it("ignores a custom life that makes no sense", () => {
    expect(parseSettings({ customLife: 0 }).customLife).toBe(DEFAULT_SETTINGS.customLife);
    expect(parseSettings({ customLife: 1000 }).customLife).toBe(DEFAULT_SETTINGS.customLife);
    expect(parseSettings({ customLife: 2.5 }).customLife).toBe(DEFAULT_SETTINGS.customLife);
    expect(parseSettings({ customLife: "40" }).customLife).toBe(DEFAULT_SETTINGS.customLife);
  });

  it("never shares the default object", () => {
    const s = parseSettings(null);
    s.show.monarch = false;
    expect(DEFAULT_SETTINGS.show.monarch).toBe(true);
  });
});
