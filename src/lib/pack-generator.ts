import type { Color, CubeCard, GenerationMode } from "../types";

const PACK_SIZE = 15;

function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pureRandom(pool: readonly CubeCard[]): CubeCard[] {
  return shuffle(pool).slice(0, PACK_SIZE);
}

type Bucket = "W" | "U" | "B" | "R" | "G" | "M" | "C";

function bucketOf(card: CubeCard): Bucket {
  const colors = card.colors;
  if (colors.length === 0) return "C";
  if (colors.length > 1) return "M";
  return colors[0] as Color;
}

const TARGETS: Record<Bucket, number> = {
  W: 2,
  U: 2,
  B: 2,
  R: 2,
  G: 2,
  M: 3,
  C: 2,
};

function colorBalanced(pool: readonly CubeCard[]): CubeCard[] {
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

  // Shuffle each bucket so we draw randomly within color
  (Object.keys(buckets) as Bucket[]).forEach((k) => {
    buckets[k] = shuffle(buckets[k]);
  });

  const picked: CubeCard[] = [];
  const pickedIds = new Set<string>();

  // First pass: take target count from each bucket (if available)
  (Object.keys(TARGETS) as Bucket[]).forEach((b) => {
    const want = TARGETS[b];
    const taken = buckets[b].splice(0, want);
    for (const c of taken) {
      picked.push(c);
      pickedIds.add(c.scryfall_id);
    }
  });

  // Second pass: fill any shortfall from the largest remaining bucket
  while (picked.length < PACK_SIZE) {
    const remaining = (Object.keys(buckets) as Bucket[])
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

  return picked.slice(0, PACK_SIZE);
}

function powerWeighted(_pool: readonly CubeCard[]): CubeCard[] {
  throw new Error("Power-Weighted mode requires tier tagging — not yet implemented.");
}

export function generatePack(
  pool: readonly CubeCard[],
  mode: GenerationMode,
): { cards: CubeCard[]; warning?: string } {
  if (pool.length === 0) {
    return { cards: [], warning: "Pool is empty. Reset to start a new session." };
  }

  let warning: string | undefined;
  if (pool.length < PACK_SIZE) {
    warning = `Pool has only ${pool.length} cards left — pack is short.`;
  }

  switch (mode) {
    case "random":
      return { cards: pureRandom(pool), warning };
    case "color-balanced":
      return { cards: colorBalanced(pool), warning };
    case "power-weighted":
      return { cards: powerWeighted(pool), warning };
  }
}
