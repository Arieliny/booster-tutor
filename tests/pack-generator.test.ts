import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PACK_SIZE, MAX_PACK_SIZE, MIN_PACK_SIZE, generatePack } from "../src/lib/pack-generator";
import type { Color, CubeCard } from "../src/types";

let n = 0;
function card(colors: Color[], extra: Partial<CubeCard> = {}): CubeCard {
  n++;
  return {
    name: `Card ${n}`,
    mana_cost: "",
    cmc: 1,
    colors,
    color_identity: colors,
    type_line: "Creature",
    image_url: null,
    image_url_back: null,
    scryfall_id: `id-${n}`,
    set: "tst",
    collector_number: String(n),
    ...extra,
  };
}

type Bucket = "W" | "U" | "B" | "R" | "G" | "M" | "C";
const many = (colors: Color[], count: number) => Array.from({ length: count }, () => card(colors));

/** A roomy cube: 30 of each colour, 30 multicolour, 30 colourless. */
function bigPool(): CubeCard[] {
  return [
    ...many(["W"], 30),
    ...many(["U"], 30),
    ...many(["B"], 30),
    ...many(["R"], 30),
    ...many(["G"], 30),
    ...many(["W", "U"], 10),
    ...many(["B", "R", "G"], 10),
    ...many(["U", "B"], 10),
    ...many([], 30),
  ];
}

function bucketCounts(cards: CubeCard[]): Record<Bucket, number> {
  const out: Record<Bucket, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, M: 0, C: 0 };
  for (const c of cards) out[c.colors.length === 0 ? "C" : c.colors.length > 1 ? "M" : (c.colors[0] as Bucket)]++;
  return out;
}

/** Deterministic Math.random (mulberry32). */
function seedRandom(seed: number) {
  let a = seed;
  vi.spyOn(Math, "random").mockImplementation(() => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

afterEach(() => vi.restoreAllMocks());

describe("pack size constants", () => {
  it("exposes sane bounds around the default", () => {
    expect(MIN_PACK_SIZE).toBe(1);
    expect(MAX_PACK_SIZE).toBe(40);
    expect(DEFAULT_PACK_SIZE).toBe(15);
    expect(DEFAULT_PACK_SIZE).toBeGreaterThanOrEqual(MIN_PACK_SIZE);
    expect(DEFAULT_PACK_SIZE).toBeLessThanOrEqual(MAX_PACK_SIZE);
  });
});

describe.each(["random", "color-balanced"] as const)("generatePack (%s)", (mode) => {
  it("returns exactly the requested number of cards across the whole size range", () => {
    const pool = bigPool();
    for (let size = MIN_PACK_SIZE; size <= MAX_PACK_SIZE; size++) {
      const { cards, warning } = generatePack(pool, mode, size);
      expect(cards).toHaveLength(size);
      expect(warning).toBeUndefined();
    }
  });

  it("never repeats a card within a pack", () => {
    const pool = bigPool();
    for (let i = 0; i < 25; i++) {
      const { cards } = generatePack(pool, mode, MAX_PACK_SIZE);
      expect(new Set(cards.map((c) => c.scryfall_id)).size).toBe(cards.length);
    }
  });

  it("only draws cards that are in the given pool", () => {
    const pool = bigPool();
    const ids = new Set(pool.map((c) => c.scryfall_id));
    for (let i = 0; i < 25; i++) {
      for (const c of generatePack(pool, mode, DEFAULT_PACK_SIZE).cards) expect(ids.has(c.scryfall_id)).toBe(true);
    }
  });

  it("does not mutate the pool it was given", () => {
    const pool = bigPool();
    const before = pool.map((c) => c.scryfall_id);
    generatePack(pool, mode, DEFAULT_PACK_SIZE);
    expect(pool.map((c) => c.scryfall_id)).toEqual(before);
  });

  it("returns an empty pack with a warning for an empty pool", () => {
    const res = generatePack([], mode, DEFAULT_PACK_SIZE);
    expect(res.cards).toEqual([]);
    expect(res.warning).toMatch(/empty/i);
  });

  it("hands back the whole pool, with a warning, when it has fewer cards than the pack size", () => {
    const pool = bigPool().slice(0, 7);
    const { cards, warning } = generatePack(pool, mode, DEFAULT_PACK_SIZE);
    expect(cards).toHaveLength(7);
    expect(new Set(cards.map((c) => c.scryfall_id))).toEqual(new Set(pool.map((c) => c.scryfall_id)));
    expect(warning).toBe("Pool has only 7 cards left — pack is short.");
  });

  it("does not warn when the pool exactly matches the pack size", () => {
    const pool = bigPool().slice(0, DEFAULT_PACK_SIZE);
    const { cards, warning } = generatePack(pool, mode, DEFAULT_PACK_SIZE);
    expect(cards).toHaveLength(DEFAULT_PACK_SIZE);
    expect(warning).toBeUndefined();
  });

  it("is deterministic for a given Math.random sequence, and varies between sequences", () => {
    const pool = bigPool();
    seedRandom(42);
    const a = generatePack(pool, mode, DEFAULT_PACK_SIZE).cards.map((c) => c.scryfall_id);
    vi.restoreAllMocks();
    seedRandom(42);
    const b = generatePack(pool, mode, DEFAULT_PACK_SIZE).cards.map((c) => c.scryfall_id);
    vi.restoreAllMocks();
    seedRandom(43);
    const c = generatePack(pool, mode, DEFAULT_PACK_SIZE).cards.map((x) => x.scryfall_id);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });
});

describe("color-balanced mode", () => {
  it("makes a 15-card pack of 2 per colour + 3 multicolour + 2 colourless", () => {
    for (let i = 0; i < 20; i++) {
      const { cards } = generatePack(bigPool(), "color-balanced", 15);
      expect(bucketCounts(cards)).toEqual({ W: 2, U: 2, B: 2, R: 2, G: 2, M: 3, C: 2 });
    }
  });

  it("scales the recipe proportionally (30 cards = double the 15-card recipe)", () => {
    const { cards } = generatePack(bigPool(), "color-balanced", 30);
    expect(bucketCounts(cards)).toEqual({ W: 4, U: 4, B: 4, R: 4, G: 4, M: 6, C: 4 });
  });

  it("gives the leftover slots to multicolour, then colourless, at awkward sizes", () => {
    // 40: floor(40*2/15)=5 per colour/colourless, floor(40*3/15)=8 multi -> 38; +1 M, +1 C.
    expect(bucketCounts(generatePack(bigPool(), "color-balanced", 40).cards)).toEqual({
      W: 5, U: 5, B: 5, R: 5, G: 5, M: 9, C: 6,
    });
    // A 1-card pack is a single multicolour card (all floors are 0; the remainder goes to M first).
    const one = generatePack(bigPool(), "color-balanced", 1).cards;
    expect(one).toHaveLength(1);
    expect(bucketCounts(one).M).toBe(1);
  });

  it("buckets by card colours, not colour identity (a colourless card with a coloured identity is colourless)", () => {
    const sol = card([], { color_identity: ["W"] });
    const pool = [...many(["W"], 5), ...many(["U"], 5), ...many(["B"], 5), ...many(["R"], 5), ...many(["G"], 5), ...many(["W", "U"], 5), sol, card([])];
    const { cards } = generatePack(pool, "color-balanced", 15);
    expect(bucketCounts(cards).C).toBe(2);
    expect(cards.some((c) => c.scryfall_id === sol.scryfall_id)).toBe(true);
  });

  it("fills a short bucket from the largest remaining one, still without repeats", () => {
    // No multicolour at all: the 3 multicolour slots must come from elsewhere.
    const pool = [...many(["W"], 20), ...many(["U"], 4), ...many(["B"], 4), ...many(["R"], 4), ...many(["G"], 4), ...many([], 4)];
    const { cards, warning } = generatePack(pool, "color-balanced", 15);
    expect(cards).toHaveLength(15);
    expect(warning).toBeUndefined();
    expect(new Set(cards.map((c) => c.scryfall_id)).size).toBe(15);
    const counts = bucketCounts(cards);
    expect(counts.M).toBe(0);
    expect(counts.U).toBe(2);
    expect(counts.C).toBe(2);
    // The shortfall went to white, the biggest bucket.
    expect(counts.W).toBe(5);
  });

  it("returns every card when the pool equals the pack size, whatever its colour mix", () => {
    const pool = [...many(["R"], 10), ...many(["G"], 5)];
    const { cards } = generatePack(pool, "color-balanced", 15);
    expect(cards).toHaveLength(15);
    expect(new Set(cards.map((c) => c.scryfall_id))).toEqual(new Set(pool.map((c) => c.scryfall_id)));
  });
});

describe("random mode", () => {
  it("does not enforce a colour recipe (a mono-colour pool still fills the pack)", () => {
    const pool = many(["R"], 50);
    const { cards } = generatePack(pool, "random", 15);
    expect(cards).toHaveLength(15);
    expect(bucketCounts(cards).R).toBe(15);
  });

  it("can produce any card (every card shows up across many draws)", () => {
    const pool = many(["W"], 12);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) for (const c of generatePack(pool, "random", 3).cards) seen.add(c.scryfall_id);
    expect(seen.size).toBe(12);
  });
});
