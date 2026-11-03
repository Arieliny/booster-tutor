/**
 * Splits the offline card database into parts by the month each card first
 * came out (~220 parts), so a phone updating it downloads only the parts that
 * changed: a new set lands in its release month's part, and an old month only
 * changes when Scryfall corrects one of its cards (errata, new art choice).
 * Measured 2026-11-02 against the Oct 11 database (358 new cards, 8 changed):
 * 0.2 MB by month, 0.5 MB by quarter, 1.4 MB by year, 4 MB whole. Finer than a
 * month saves little more and the first download grows (gzip has less to work with).
 *
 * Each part's file name carries a hash of its content, so "has this phone got
 * that part?" is just "is that file in its cache?" (src/lib/card-db.ts).
 */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);

/**
 * @param {Array<{id: string}>} cards
 * @param {(card: {id: string}) => string | undefined} partOf  its part's key, e.g. "1993a"; anything else goes in "other"
 * @returns {{ version: string, parts: Array<{key: string, file: string, count: number, gz: number}>, files: Map<string, string> }}
 *   `files`: part file name -> its JSON text. `gz`: its size gzipped, about what a download costs.
 */
export function splitParts(cards, partOf) {
  const groups = new Map();
  for (const card of cards) {
    const k = partOf(card);
    const key = /^[\w-]+$/.test(k ?? "") ? k : "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  const parts = [];
  const files = new Map();
  for (const key of [...groups.keys()].sort()) {
    // Sorted by id, so the same cards always make the same file (and hash).
    const group = groups.get(key).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const json = JSON.stringify(group);
    const file = `${key}-${hash(json)}.json`;
    files.set(file, json);
    parts.push({ key, file, count: group.length, gz: gzipSync(json).length });
  }
  return { version: hash(parts.map((p) => p.file).join(" ")), parts, files };
}
