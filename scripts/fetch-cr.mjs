/**
 * Download the current Magic Comprehensive Rules and save them, parsed, for
 * the judge (api/_cr.ts):
 *
 *   node --use-system-ca scripts/fetch-cr.mjs [--soft]
 *
 * -> data/cr.json  { effective, source, fetched, rules, sections, glossary }
 *
 * Runs in the Vercel build (vercel.json) so every deploy ships the CR that's
 * current at the time; gitignored, never committed. --soft: if Wizards can't
 * be reached, keep going - the judge then fetches the CR itself at runtime.
 *
 * Parsing mirrors the mtg-judge skill's helper, so rule lookups behave the same.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crUrl, decodeCr, parseCr } from "../api/_cr-parse.js";

const soft = process.argv.includes("--soft");
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "cr.json");

try {
  const url = await crUrl();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const cr = parseCr(decodeCr(await res.arrayBuffer()), url);
  const n = Object.keys(cr.rules).length;
  if (n < 1000) throw new Error(`only ${n} rules parsed - the file format may have changed`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(cr));
  console.log(`CR effective ${cr.effective}: ${n} rules, ${Object.keys(cr.glossary).length} glossary terms -> data/cr.json`);
} catch (err) {
  console.error(`Comprehensive Rules download failed: ${err.message}`);
  if (!soft) process.exit(1);
  console.error("--soft: continuing; the judge will fetch the CR at runtime.");
}
