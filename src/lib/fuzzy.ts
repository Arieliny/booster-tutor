/**
 * Typo-tolerant card-name matching, for "Did you mean ...?" when a search
 * finds no card by name. Pure and fast enough to run on every keystroke over
 * all ~34k card names on a phone (most names are skipped by length).
 */

/** Lowercase, no accents, no apostrophes, other punctuation as spaces: "Lim-Dûl's Vault" -> "lim duls vault". */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Rows reused across calls: this runs ~70k times per search, so no allocation inside.
let rows = [new Int32Array(64), new Int32Array(64), new Int32Array(64)];

/**
 * Edit distance between `a` and the first `bLen` characters of `b` (all of
 * it by default), with swaps of neighbours counted as one edit ("teh" ->
 * "the"), or `max + 1` as soon as it's certainly more than `max`.
 */
export function editDistance(a: string, b: string, max: number, bLen = b.length): number {
  const n = Math.min(bLen, b.length);
  if (Math.abs(a.length - n) > max) return max + 1;
  if (n + 1 > rows[0].length) rows = rows.map(() => new Int32Array(n + 1));
  let [prev2, prev, cur] = rows;
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const ai = a.charCodeAt(i - 1);
    const aPrev = i > 1 ? a.charCodeAt(i - 2) : -1;
    cur[0] = i;
    let best = i;
    for (let j = 1; j <= n; j++) {
      const bj = b.charCodeAt(j - 1);
      let v = prev[j - 1] + (ai === bj ? 0 : 1);
      if (prev[j] + 1 < v) v = prev[j] + 1;
      if (cur[j - 1] + 1 < v) v = cur[j - 1] + 1;
      if (j > 1 && ai === b.charCodeAt(j - 2) && aPrev === bj && prev2[j - 2] + 1 < v) v = prev2[j - 2] + 1;
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    const t = prev2;
    prev2 = prev;
    prev = cur;
    cur = t;
  }
  return prev[n];
}

/** How many typos a query of this length may have: none for very short ones, or everything would match. */
export function typosAllowed(len: number): number {
  return len <= 3 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : 3;
}

/** Each card's forms to match against: its whole name and, for split / double-faced cards, each face. */
export type FuzzyIndex = string[][];

export function fuzzyIndex(names: string[]): FuzzyIndex {
  return names.map((n) => {
    const faces = n.split(" // ");
    return [...new Set([n, ...(faces.length > 1 ? faces : [])].map(normalizeName))];
  });
}

export interface FuzzyHit {
  index: number;
  /** Typos to the whole name, or (+0.5) to its start when the query is shorter: still typing. */
  distance: number;
  /** The name (or face) it matched, normalized. */
  form: string;
}

/** The cards whose names are closest to `query`, best first. Skips indexes `skip` says to. */
export function closestNames(index: FuzzyIndex, query: string, limit = 3, skip?: (i: number) => boolean): FuzzyHit[] {
  const q = normalizeName(query);
  const max = typosAllowed(q.replace(/ /g, "").length);
  if (max === 0) return [];
  const hits: FuzzyHit[] = [];
  for (let k = 0; k < index.length; k++) {
    if (skip?.(k)) continue;
    let best = Infinity;
    let form = "";
    for (const name of index[k]) {
      const whole = editDistance(q, name, max);
      if (whole < best) [best, form] = [whole, name];
      if (name.length > q.length) {
        const start = editDistance(q, name, max, q.length) + 0.5;
        if (start < best) [best, form] = [start, name];
      }
    }
    if (best <= max) hits.push({ index: k, distance: best, form });
  }
  // Fewest typos first; among equals, the shorter (more likely meant) name.
  hits.sort((x, y) => x.distance - y.distance || index[x.index][0].length - index[y.index][0].length);
  // A reprint whose face carries the same name ("Emeritus of Conflict // Lightning Bolt") isn't another guess.
  const seen = new Set<string>();
  return hits.filter((h) => !seen.has(h.form) && !!seen.add(h.form)).slice(0, limit);
}
