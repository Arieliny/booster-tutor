#!/usr/bin/env node
/**
 * Builds scripts/owned-proxies.json: card name -> the MPC proxy orders it was printed in.
 *
 *   node scripts/build-owned.mjs [folder with "MPC proxy order #N (cards).xml" files]
 *
 * Default folder: ../CubeOrdering/backup (the CubeOrdering project next to this one).
 * Run it whenever a proxy order is placed; the cube-review build bakes the result onto
 * the cards as `owned`, which feeds the Bench (cards Ari has that aren't in the cube).
 * Cards Ari owns that were never proxied are flagged by hand in the app instead.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const folder = process.argv[2] ?? join(here, "..", "..", "CubeOrdering", "backup");
const OUT = join(here, "owned-proxies.json");
const data = JSON.parse(readFileSync(join(here, "..", "src", "data", "cube-review.json"), "utf8"));

// Proxy file names are free-form: "Adeline, Resplendent Cathar (NormalPlus Bryan Sola)", "Mox Jet [LEA] {12}",
// "Summon Good King Mog XII", "Minsc &amp; Boo...". Match on letters and digits only, after dropping every
// bracketed group; split cards match on their front face.
const key = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/[’‘]/g, "'")
    .replace(/\.(png|jpe?g)$/i, "")
    .replace(/\s*[([{][^)\]}]*[)\]}]/g, "")
    .split(" // ")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const known = new Map();
for (const c of Object.values(data.cards)) known.set(key(c.name), c.name);
// Not cards: the basics and tokens that ride along in an order.
const SKIP = new Set(["plains", "island", "swamp", "mountain", "forest", "theinitiative", "boo"]);
// A readable name for a card the data doesn't have yet (the build looks it up on Scryfall).
const pretty = (f) =>
  f
    .replace(/&amp;/g, "&")
    .replace(/[’‘]/g, "'")
    .replace(/\.(png|jpe?g)$/i, "")
    .replace(/\s*[([{][^)\]}]*[)\]}]/g, "")
    .replace(/_/g, "'")
    .trim();

const tag = (s, t) => (s.match(new RegExp(`<${t}>([^]*?)</${t}>`)) || [])[1] ?? "";
const owned = {};
let skipped = 0;
const unknown = new Map();
const files = readdirSync(folder).filter((f) => /^MPC proxy order #\d+ \(cards\)\.xml$/.test(f)).sort();
for (const f of files) {
  const order = `MPC #${f.match(/#(\d+)/)[1]}`;
  const xml = readFileSync(join(folder, f), "utf8");
  for (const c of tag(xml, "fronts").matchAll(/<card>([^]*?)<\/card>/g)) {
    const raw = tag(c[1], "name");
    const k = key(raw);
    if (SKIP.has(k)) {
      skipped++;
      continue;
    }
    const name = known.get(k) ?? pretty(raw);
    if (!known.has(k)) unknown.set(name, order);
    (owned[name] ??= []).includes(order) || owned[name].push(order);
  }
}
const sorted = Object.fromEntries(Object.keys(owned).sort((a, b) => a.localeCompare(b)).map((n) => [n, owned[n]]));
writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n");
console.log(`${files.length} orders, ${Object.keys(sorted).length} distinct cards owned as proxies (${skipped} basics/tokens skipped) -> ${OUT}`);
if (unknown.size) console.log(`Not in the cube data yet, the build will look them up (${unknown.size}): ${[...unknown.keys()].join("; ")}`);
