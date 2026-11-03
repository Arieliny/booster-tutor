#!/usr/bin/env node
/**
 * Builds the offline card database: public/card-db/
 *
 *   node --use-system-ca scripts/build-card-db.mjs [--soft]
 *
 * Every real Magic card's text (no images), trimmed from Scryfall's Oracle
 * Cards bulk file: ~34k cards, ~12 MB on disk, ~4 MB over the wire with
 * Vercel's compression. The app downloads it once on demand and keeps it in
 * Cache Storage, so card lookup works with no connection.
 *
 * Written as one part per month of first printing plus index.json listing them
 * (scripts/lib/card-db-parts.mjs), so an update downloads only the parts that
 * changed: a new set costs a few hundred KB, not the whole 4 MB.
 *
 * Runs as part of the Vercel build (see vercel.json), so every deploy ships
 * current cards and the file is never committed. --soft makes a failure (e.g.
 * Scryfall down) a warning instead of failing the deploy: the app then reports
 * the database as unavailable, and devices that already downloaded it keep
 * their copy.
 *
 * Filtering: only true non-cards are dropped (tokens, art cards, planes,
 * schemes, vanguards, emblems, Arena Alchemy and A- rebalanced cards). It
 * deliberately does NOT filter on `digital` or memorabilia: the representative
 * printing of many paper cards is an MTGO or collector's version, and filtering
 * on that silently dropped Black Lotus, the Moxen, Time Walk and the dual lands.
 * MTGO-only cards like Gleemox are real cube cards too.
 */
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { oldestPrintings } from "./lib/oldest-printings.mjs";
import { splitParts } from "./lib/card-db-parts.mjs";

const SOFT = process.argv.includes("--soft");
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "card-db");
const UA = "BoosterTutor/1.0 (card database build)";
const SKIP_LAYOUTS = new Set([
  "token",
  "double_faced_token",
  "emblem",
  "art_series",
  "planar",
  "scheme",
  "vanguard",
]);

async function build() {
  const index = await (
    await fetch("https://api.scryfall.com/bulk-data", { headers: { "User-Agent": UA, Accept: "application/json" } })
  ).json();
  const meta = index.data.find((d) => d.type === "oracle_cards");
  const url = meta?.download_uri ?? meta?.jsonl_download_uri;
  if (!url) throw new Error("Scryfall bulk index has no oracle_cards file");

  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`oracle_cards download: HTTP ${res.status}`);
  const gz = url.endsWith(".gz");
  const input = gz ? Readable.fromWeb(res.body).pipe(createGunzip()) : Readable.fromWeb(res.body);
  const lines = createInterface({ input, crlfDelay: Infinity });
  const jsonl = /\.jsonl(\.gz)?$/.test(url);

  const pt = (x) => (x.power != null ? `${x.power}/${x.toughness}` : undefined);
  const cards = [];
  const firstMonth = new Map(); // oracle id -> "1993-08", the month of its first printing: which part it goes in
  let seen = 0;
  for await (let line of lines) {
    if (!jsonl) line = line.trim().replace(/^\[|,$|\]$/g, "");
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    seen++;
    if (SKIP_LAYOUTS.has(c.layout) || c.set_type === "alchemy" || /^A-/.test(c.name)) continue;
    const faces = c.card_faces;
    const id = c.oracle_id ?? faces?.[0]?.oracle_id;
    firstMonth.set(id, c.released_at?.slice(0, 7)); // the representative printing's, until the oldest-printing pass below
    cards.push({
      id,
      s: c.id, // Scryfall id: image URLs are derived from it
      n: c.name,
      c: c.mana_cost || undefined,
      t: c.type_line || undefined,
      o: c.oracle_text || undefined,
      p: pt(c),
      l: c.loyalty,
      i: (c.color_identity ?? []).join(""),
      m: c.cmc ?? 0,
      r: (c.rarity ?? "c")[0],
      y: c.layout !== "normal" ? c.layout : undefined,
      b: !c.image_uris && faces?.[1]?.image_uris ? 1 : undefined, // back face has its own image
      f: faces?.map((x) => ({
        n: x.name,
        c: x.mana_cost || undefined,
        t: x.type_line || undefined,
        o: x.oracle_text || undefined,
        p: pt(x),
        l: x.loyalty,
      })),
    });
  }
  if (cards.length < 20000) throw new Error(`only ${cards.length} cards - refusing to write a partial database`);

  // Show each card's OLDEST regular printing (Ari prefers original art). Best
  // effort: if this pass fails, keep Scryfall's default printings.
  try {
    const oldest = await oldestPrintings({ userAgent: UA });
    let changed = 0;
    for (const card of cards) {
      const o = oldest.get(card.id);
      if (o?.released) firstMonth.set(card.id, o.released.slice(0, 7));
      if (!o || o.sid === card.s) continue;
      card.s = o.sid;
      card.b = o.back ? 1 : undefined;
      changed++;
    }
    console.log(`card-db: oldest artwork chosen for ${changed} cards`);
  } catch (err) {
    console.warn(`card-db: oldest-artwork pass failed (${err instanceof Error ? err.message : err}); keeping default printings`);
  }

  // Without the oldest-printing pass many cards change month, so the next update downloads nearly everything once.
  const { version, parts, files } = splitParts(cards, (card) => firstMonth.get(card.id));
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const [file, json] of files) writeFileSync(join(OUT, file), json);
  const doc = { builtAt: new Date().toISOString(), source: meta.updated_at, count: cards.length, version, parts };
  writeFileSync(join(OUT, "index.json"), JSON.stringify(doc));
  const mb = (n) => (n / 1e6).toFixed(1);
  const raw = [...files.values()].reduce((n, j) => n + j.length, 0);
  const zipped = parts.reduce((n, p) => n + p.gz, 0);
  console.log(`card-db: ${cards.length} cards (of ${seen} Scryfall entries) in ${parts.length} parts, ${mb(raw)} MB (${mb(zipped)} MB gzipped) -> public/card-db/, version ${version}`);
}

try {
  await build();
} catch (err) {
  console.error(`card-db: FAILED - ${err instanceof Error ? err.message : err}`);
  if (!SOFT) process.exit(1);
  console.error("card-db: --soft, continuing the build without a card database");
}
