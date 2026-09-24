/**
 * Bake the mana symbols used by the set-review data: `node scripts/build-mana-symbols.mjs`
 *
 * Writes src/data/mana-symbols.json, mapping each symbol ("W", "2", "G/W", …)
 * to an inline `data:image/svg+xml` URI of Scryfall's official artwork.
 *
 * They're inlined rather than hotlinked on purpose: the app is meant to work
 * offline at a prerelease, and runtime requests to svgs.scryfall.io would be
 * exactly the thing that fails there. Only the symbols actually present in the
 * data are included, so this stays small — re-run it after adding a set.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "src", "data");
const OUT = path.join(DATA_DIR, "mana-symbols.json");
const UA = "BoosterTutor/1.0 (https://booster-tutor.vercel.app)";

// Collect every {symbol} appearing in any set-review data file.
const used = new Set();
for (const f of fs.readdirSync(DATA_DIR).filter((f) => /^set-review-.*\.json$/.test(f))) {
  const doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
  for (const card of doc.cards ?? []) {
    for (const m of String(card.mana_cost ?? "").matchAll(/\{([^}]+)\}/g)) {
      used.add(m[1]);
    }
  }
}
if (used.size === 0) throw new Error("No mana symbols found in src/data/set-review-*.json");

const res = await fetch("https://api.scryfall.com/symbology", {
  headers: { "User-Agent": UA, Accept: "application/json" },
});
if (!res.ok) throw new Error(`Scryfall symbology HTTP ${res.status}`);
const { data } = await res.json();

/** Strip the bits of Scryfall's SVGs we don't need, to keep the data URI small. */
function minify(svg) {
  return svg
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s*\n\s*/g, "")
    .replace(/>\s+</g, "><")
    .trim();
}

const out = {};
const missing = [];
for (const symbol of [...used].sort()) {
  const entry = data.find((s) => s.symbol === `{${symbol}}`);
  if (!entry?.svg_uri) {
    missing.push(symbol);
    continue;
  }
  const svgRes = await fetch(entry.svg_uri, { headers: { "User-Agent": UA } });
  if (!svgRes.ok) {
    missing.push(symbol);
    continue;
  }
  const svg = minify(await svgRes.text());
  out[symbol] = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  await new Promise((r) => setTimeout(r, 90)); // be polite to the CDN
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

const bytes = fs.statSync(OUT).size;
console.log(`${path.relative(ROOT, OUT)}: ${Object.keys(out).length} symbols, ${(bytes / 1024).toFixed(1)} KB`);
if (missing.length) console.log(`missing (rendered as text): ${missing.join(", ")}`);
