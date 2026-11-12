#!/usr/bin/env node
/**
 * Records what this deploy's data was built from, so the daily check can tell
 * when it's out of date (api/_data-refresh.ts) and phones can tell when their
 * offline card database is (src/lib/card-db.ts):
 *
 *   node --use-system-ca scripts/write-data-version.mjs
 *
 * -> public/data-version.json (served to the app) and data/data-version.json
 *    (bundled with the cron function). Both gitignored.
 *
 *   { builtAt,
 *     cards: { builtAt, count, total, version },   // the card database's build, Scryfall's card count then, and its content version
 *     cr: { source, effective } }         // the Comprehensive Rules file the judge got
 *
 * Runs in the Vercel build after build-card-db and fetch-cr. Never fails the
 * build: anything it can't find is null, and the daily check then rebuilds.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listHash, scryfallTotal } from "../api/_data-version.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => {
  try {
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
  } catch {
    return null;
  }
};

const db = readJson(join(root, "public", "card-db", "index.json"));
const cr = readJson(join(root, "data", "cr.json"));
const review = readJson(join(root, "src", "data", "cube-review.json"));
let total = null;
try {
  total = await scryfallTotal();
} catch (err) {
  console.error(`Scryfall card count failed: ${err.message}`);
}

const version = {
  builtAt: new Date().toISOString(),
  cards: db ? { builtAt: db.builtAt, count: db.count, total, version: db.version } : null,
  cr: cr ? { source: cr.source, effective: cr.effective } : null,
  // Which Cube Cobra list "My cube" was built from, so a commit there triggers a rebuild.
  mine: review?.cubes?.mine ? { cubeId: review.cubes.mine.cubeId, hash: listHash(review.cubes.mine.cards) } : null,
  // Every cube the review compares against (LSV, MTGO, Arena too), so their updates trigger one as well.
  cubes: review?.cubes
    ? Object.fromEntries(
        Object.entries(review.cubes).map(([key, c]) => [key, { cubeId: c.cubeId, label: c.label, hash: listHash(c.cards ?? []) }]),
      )
    : null,
  review: review?.builtAt ?? null,
};
const text = JSON.stringify(version);
for (const out of [join(root, "public", "data-version.json"), join(root, "data", "data-version.json")]) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
}
console.log(`data-version: cards ${version.cards?.count ?? "none"} (Scryfall ${total ?? "?"}), CR ${version.cr?.effective ?? "none"}, cube lists from ${version.review ?? "none"} (${Object.entries(version.cubes ?? {}).map(([k, c]) => `${k} ${c.hash}`).join(", ")})`);
