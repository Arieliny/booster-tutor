/**
 * One-time enrichment script.
 * Reads scripts/cube-list.txt, queries Scryfall for the EXACT printing of each
 * card (by set code + collector number), and writes src/data/cube.json.
 *
 * Run: npx tsx scripts/enrich-cube.ts
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INPUT_FILE = join(ROOT, "scripts", "cube-list.txt");
const OUTPUT_FILE = join(ROOT, "src", "data", "cube.json");
const FAILED_FILE = join(ROOT, "scripts", "failed.txt");

const REQUEST_DELAY_MS = 100; // Scryfall asks for 50-100ms between requests

interface ParsedLine {
  raw: string;
  name: string;
  set: string;
  collectorNumber: string;
}

interface CardFace {
  image_uris?: { normal?: string };
}

interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  colors?: string[];
  color_identity?: string[];
  type_line?: string;
  image_uris?: { normal?: string };
  card_faces?: CardFace[];
}

interface EnrichedCard {
  name: string;
  mana_cost: string;
  cmc: number;
  colors: string[];
  color_identity: string[];
  type_line: string;
  image_url: string | null;
  image_url_back: string | null;
  scryfall_id: string;
  set: string;
  collector_number: string;
}

function parseLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Format: "1 Card Name (SET) collector_number [optional flags like *F*]"
  // The set code is wrapped in parentheses.
  const match = trimmed.match(/^\d+\s+(.+?)\s+\(([A-Z0-9]+)\)\s+(\S+)/);
  if (!match) return null;

  const [, namePart, setCode, collectorRaw] = match;

  // Strip foil markers and other annotations after the collector number on the
  // same line are excluded by the regex above (\S+ stops at whitespace).
  // But the collector itself may have trailing chars like "82d" - keep as-is.
  return {
    raw: trimmed,
    name: namePart.trim(),
    set: setCode.toLowerCase(),
    collectorNumber: collectorRaw.trim(),
  };
}

async function fetchCard(parsed: ParsedLine): Promise<ScryfallCard> {
  const url = `https://api.scryfall.com/cards/${parsed.set}/${encodeURIComponent(parsed.collectorNumber)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "BoosterTutor/1.0 (cube enrichment)",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${parsed.set}/${parsed.collectorNumber} (${parsed.name})`);
  }
  return (await res.json()) as ScryfallCard;
}

function toEnriched(parsed: ParsedLine, card: ScryfallCard): EnrichedCard {
  // Single-faced: image_uris on the card itself.
  // Double-faced: image_uris is missing on the card; pull from card_faces.
  let imageFront: string | null = card.image_uris?.normal ?? null;
  let imageBack: string | null = null;
  if (!imageFront && card.card_faces && card.card_faces.length > 0) {
    imageFront = card.card_faces[0]?.image_uris?.normal ?? null;
    imageBack = card.card_faces[1]?.image_uris?.normal ?? null;
  }

  return {
    name: card.name,
    mana_cost: card.mana_cost ?? "",
    cmc: card.cmc ?? 0,
    colors: card.colors ?? [],
    color_identity: card.color_identity ?? [],
    type_line: card.type_line ?? "",
    image_url: imageFront,
    image_url_back: imageBack,
    scryfall_id: card.id,
    set: parsed.set,
    collector_number: parsed.collectorNumber,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const raw = await readFile(INPUT_FILE, "utf8");
  const lines = raw.split(/\r?\n/);

  const parsed: ParsedLine[] = [];
  const unparseable: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const p = parseLine(trimmed);
    if (p) parsed.push(p);
    else unparseable.push(trimmed);
  }

  if (unparseable.length > 0) {
    console.warn(`WARNING: ${unparseable.length} lines could not be parsed:`);
    unparseable.forEach((l) => console.warn(`  ${l}`));
  }

  console.log(`Parsed ${parsed.length} cards. Fetching from Scryfall...`);

  const enriched: EnrichedCard[] = [];
  const failed: { line: string; error: string }[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    try {
      const card = await fetchCard(p);
      enriched.push(toEnriched(p, card));
      if ((i + 1) % 25 === 0 || i === parsed.length - 1) {
        console.log(`  [${i + 1}/${parsed.length}] ${p.name}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED: ${p.raw} -- ${msg}`);
      failed.push({ line: p.raw, error: msg });
    }
    if (i < parsed.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  const output = {
    generated_at: new Date().toISOString(),
    card_count: enriched.length,
    cards: enriched,
  };

  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
  console.log(`\nWrote ${enriched.length} cards to ${OUTPUT_FILE}`);

  if (failed.length > 0) {
    const failedText = failed.map((f) => `${f.line}\n  -> ${f.error}`).join("\n");
    await writeFile(FAILED_FILE, failedText, "utf8");
    console.log(`Wrote ${failed.length} failures to ${FAILED_FILE}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
