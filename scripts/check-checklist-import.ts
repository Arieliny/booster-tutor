/**
 * Read the CubeOrdering files the way the Checklists page's "Open a file…" does,
 * and print what it would make of them (a check that the formats still parse):
 *
 *   npx tsx scripts/check-checklist-import.ts [CubeOrdering folder]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeRows, nameKey, parseList } from "../src/lib/checklists.js";

const dir = process.argv[2] ?? join("..", "CubeOrdering");
const files = [
  "backup/All orders - card by card.csv",
  "carts/history/f2f-cart-2026-10-30-as-ordered.txt",
  "carts/tdh-cart.txt",
  "backup/MPC proxy order #3 (cards).xml",
];
for (const f of files) {
  let text: string;
  try {
    text = readFileSync(join(dir, f), "utf8");
  } catch {
    console.log(`${f}: not found`);
    continue;
  }
  const rows = parseList(text);
  const { names, details } = mergeRows(rows);
  const tally = (pick: (r: (typeof rows)[number]) => string | undefined) =>
    Object.entries(rows.reduce<Record<string, number>>((a, r) => ((a[pick(r) ?? "-"] = (a[pick(r) ?? "-"] ?? 0) + 1), a), {}))
      .map(([k, n]) => `${k} ${n}`)
      .join(", ");
  const copies = rows.reduce((a, r) => a + (r.qty ?? 1), 0);
  console.log(`\n${f}\n  ${rows.length} lines, ${names.length} cards, ${copies} copies`);
  console.log(`  cube: ${tally((r) => r.group)}\n  from: ${tally((r) => r.from)}`);
  const sample = names.slice(0, 3).map((n) => `${n} ${JSON.stringify(details[nameKey(n)] ?? {})}`);
  console.log(`  e.g. ${sample.join("\n       ")}`);
}
