import type { Color, CubeCard, GenerationMode } from "../types";

export const DEFAULT_PACK_SIZE = 15;
export const MIN_PACK_SIZE = 1;
export const MAX_PACK_SIZE = 40;

function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pureRandom(pool: readonly CubeCard[], size: number): CubeCard[] {
  return shuffle(pool).slice(0, size);
}

type Bucket = "W" | "U" | "B" | "R" | "G" | "M" | "C";
const BUCKETS: Bucket[] = ["W", "U", "B", "R", "G", "M", "C"];

function bucketOf(card: CubeCard): Bucket {
  const colors = card.colors;
  if (colors.length === 0) return "C";
  if (colors.length > 1) return "M";
  return colors[0] as Color;
}

/**
 * Default 15-card targets: 2W/2U/2B/2R/2G/3M/2C.
 * For other sizes we scale proportionally and distribute the remainder
 * (after rounding down) preferring multicolor → colorless → each color.
 */
function targetsFor(size: number): Record<Bucket, number> {
  const baseRatios: Record<Bucket, number> = {
    W: 2 / 15,
    U: 2 / 15,
    B: 2 / 15,
    R: 2 / 15,
    G: 2 / 15,
    M: 3 / 15,
    C: 2 / 15,
  };
  const targets: Record<Bucket, number> = {
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
    M: 0,
    C: 0,
  };
  let assigned = 0;
  for (const b of BUCKETS) {
    targets[b] = Math.floor(baseRatios[b] * size);
    assigned += targets[b];
  }
  // Distribute remainder. Order: M, C, then each color.
  const fillOrder: Bucket[] = ["M", "C", "W", "U", "B", "R", "G"];
  let i = 0;
  while (assigned < size) {
    targets[fillOrder[i % fillOrder.length]]++;
    assigned++;
    i++;
  }
  return targets;
}

function colorBalanced(pool: readonly CubeCard[], size: number): CubeCard[] {
  const buckets: Record<Bucket, CubeCard[]> = {
    W: [],
    U: [],
    B: [],
    R: [],
    G: [],
    M: [],
    C: [],
  };
  for (const card of pool) buckets[bucketOf(card)].push(card);
  for (const b of BUCKETS) buckets[b] = shuffle(buckets[b]);

  const targets = targetsFor(size);
  const picked: CubeCard[] = [];
  const pickedIds = new Set<string>();

  for (const b of BUCKETS) {
    const want = targets[b];
    const taken = buckets[b].splice(0, want);
    for (const c of taken) {
      picked.push(c);
      pickedIds.add(c.scryfall_id);
    }
  }

  // Fill any shortfall (bucket was too small) from the largest remaining bucket.
  while (picked.length < size) {
    const remaining = BUCKETS
      .map((b) => ({ bucket: b, count: buckets[b].length }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
    if (remaining.length === 0) break;
    const top = buckets[remaining[0].bucket];
    const card = top.shift();
    if (!card) break;
    if (pickedIds.has(card.scryfall_id)) continue;
    picked.push(card);
    pickedIds.add(card.scryfall_id);
  }

  return picked.slice(0, size);
}

export function generatePack(
  pool: readonly CubeCard[],
  mode: GenerationMode,
  size: number,
): { cards: CubeCard[]; warning?: string } {
  if (pool.length === 0) {
    return { cards: [], warning: "Pool is empty. Reset to start a new session." };
  }

  let warning: string | undefined;
  const effectiveSize = Math.min(size, pool.length);
  if (effectiveSize < size) {
    warning = `Pool has only ${pool.length} cards left — pack is short.`;
  }

  switch (mode) {
    case "random":
      return { cards: pureRandom(pool, effectiveSize), warning };
    case "color-balanced":
      return { cards: colorBalanced(pool, effectiveSize), warning };
  }
}
