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

// Through the Omenpaths (om1 / omb) reprints the Spider-Man set under in-universe names ("Ademi of the
// Silkchutes" is Spectacular Spider-Man). Ari's proxies carry those names; Scryfall keys the card by its real
// name and keeps the Omenpaths one as printed_name, so map printed name -> name for anything the data doesn't know.
const ALIASES = join(here, "card-aliases.json");
const aliases = {};
async function omenpaths() {
  const map = new Map();
  let url = "https://api.scryfall.com/cards/search?q=" + encodeURIComponent("(e:om1 or e:omb)") + "&unique=prints";
  while (url) {
    await new Promise((r) => setTimeout(r, 200));
    const r = await fetch(url, { headers: { "User-Agent": "BoosterTutor/1.0 (owned cards)", Accept: "application/json" } });
    if (!r.ok) throw new Error(`Scryfall ${r.status} for the Omenpaths list`);
    const j = await r.json();
    for (const c of j.data) {
      // Double-faced cards keep their printed names on the faces ("Goben, Gene-Splice Savant // Fleem, Goben's Creation").
      const printed = c.printed_name ?? (c.card_faces?.every((f) => f.printed_name) ? c.card_faces.map((f) => f.printed_name).join(" // ") : null);
      if (printed && printed !== c.name) map.set(key(printed), { name: c.name, printed });
    }
    url = j.has_more ? j.next_page : null;
  }
  return map;
}

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
// Unknown names: Omenpaths printed names resolve to the real card (and are kept as an alias for the app).
if (unknown.size) {
  const om = await omenpaths();
  for (const name of [...unknown.keys()]) {
    const hit = om.get(key(name));
    if (!hit) continue;
    const orders = owned[name];
    delete owned[name];
    for (const o of orders) (owned[hit.name] ??= []).includes(o) || owned[hit.name].push(o);
    aliases[hit.name] = hit.printed;
    unknown.delete(name);
  }
}
const sorted = Object.fromEntries(Object.keys(owned).sort((a, b) => a.localeCompare(b)).map((n) => [n, owned[n]]));
writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n");
writeFileSync(ALIASES, JSON.stringify(Object.fromEntries(Object.keys(aliases).sort().map((n) => [n, aliases[n]])), null, 1) + "\n");
console.log(`${files.length} orders, ${Object.keys(sorted).length} distinct cards owned as proxies (${skipped} basics/tokens skipped) -> ${OUT}`);
if (Object.keys(aliases).length) console.log(`Omenpaths names resolved: ${Object.entries(aliases).map(([n, p]) => `${p} = ${n}`).join("; ")}`);
if (unknown.size) console.log(`Not in the cube data yet, the build will look them up (${unknown.size}): ${[...unknown.keys()].join("; ")}`);
