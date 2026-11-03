import { describe, expect, it } from "vitest";
import { closestNames, editDistance, fuzzyIndex, normalizeName, typosAllowed } from "../src/lib/fuzzy";

const NAMES = ["Lightning Bolt", "Lightning Helix", "Lightning Blast", "Counterspell", "Fire // Ice", "Lim-Dûl's Vault", "Brainstorm", "Bolt"];
const index = fuzzyIndex(NAMES);
const best = (q: string) => closestNames(index, q).map((h) => NAMES[h.index]);

describe("normalizeName", () => {
  it("drops accents, apostrophes and punctuation", () => {
    expect(normalizeName("Lim-Dûl's Vault")).toBe("lim duls vault");
    expect(normalizeName("  Fire // Ice ")).toBe("fire ice");
  });
});

describe("editDistance", () => {
  it("counts typos, a swap of neighbours as one", () => {
    expect(editDistance("counterspel", "counterspell", 2)).toBe(1);
    expect(editDistance("brianstorm", "brainstorm", 2)).toBe(1);
    expect(editDistance("cat", "dog", 1)).toBe(2); // max + 1: certainly more than allowed
  });
});

describe("closestNames", () => {
  it("finds the card behind a typo", () => {
    expect(best("lightnig bolt")[0]).toBe("Lightning Bolt");
    expect(best("conterspell")[0]).toBe("Counterspell");
    expect(best("brianstorm")[0]).toBe("Brainstorm");
  });

  it("matches the start of a name while still typing", () => {
    expect(best("lightnig")).toContain("Lightning Bolt");
  });

  it("matches a split card's face, and ignores accents and apostrophes", () => {
    expect(best("ise")).toEqual([]); // too short to guess
    expect(best("lim duls vualt")[0]).toBe("Lim-Dûl's Vault");
    expect(best("fier")[0]).toBe("Fire // Ice");
  });

  it("offers nothing for very short or far-off queries", () => {
    expect(typosAllowed(3)).toBe(0);
    expect(best("zzzzzzzz")).toEqual([]);
  });

  it("skips what it's told to", () => {
    const hits = closestNames(index, "lightnig bolt", 3, (k) => NAMES[k] === "Lightning Bolt");
    expect(hits.map((h) => NAMES[h.index])).not.toContain("Lightning Bolt");
  });
});
