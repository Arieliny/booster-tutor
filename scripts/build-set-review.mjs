/**
 * Rebuild a set-review data file: `node scripts/build-set-review.mjs fra`
 *
 * Card facts come from Scryfall (authoritative). Grades come from
 * scripts/set-review-grades-<set>.json, which is the saved output of a
 * one-time extraction pass over the podcast transcript.
 *
 * HOW THE GRADES FILE WAS PRODUCED (not scripted — it needs an LLM):
 *   1. Split the transcript into ~8 overlapping chunks at paragraph
 *      boundaries (overlap matters: a card's grade often straddles a cut).
 *   2. Run one extraction agent per chunk, giving each the canonical Scryfall
 *      card-name list so spoken/garbled names snap back to real cards, and
 *      requiring strict JSON out.
 *   3. Merge, then diff against the full card list and run a second targeted
 *      pass over just the cards that came back ungraded.
 *   4. Leave a card ungraded when the hosts genuinely never said a letter —
 *      never infer one from tone.
 *
 * Re-running this script is safe and regenerates src/data/set-review-<set>.json.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SET = (process.argv[2] ?? "fra").toLowerCase();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRADES_FILE = path.join(ROOT, "scripts", `set-review-grades-${SET}.json`);
const OUT_FILE = path.join(ROOT, "src", "data", `set-review-${SET}.json`);

const SOURCES = {
  fra: {
    setName: "Reality Fracture",
    title: "Limited Resources 872 — Reality Fracture Set Review: Commons and Uncommons",
    url: "https://www.youtube.com/watch?v=mLABrUxyTKw",
    reviewers: ["Marshall Sutcliffe", "Luis Scott-Vargas"],
  },
};

/**
 * Grades the hosts gave to a cycle as a whole rather than card by card.
 * For Reality Fracture, Marshall: "they're all the same, so we'll use Fatehold
 * Annex as our example ... there's one for each color", Luis: "about C+ level".
 */
const CYCLE_GRADES = {
  fra: [
    {
      match: /^(Fatehold|Theorix|Stingerquill|Konstrari|Vigorbloom) Annex$/,
      marshall: null,
      luis: "C+",
      note: "Graded as a cycle - all five annexes are the same card. Marshall: don't overlook these if you're heavy on playables.",
    },
  ],
};

const UA = "BoosterTutor/1.0 (https://booster-tutor.vercel.app)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchCards(set) {
  let url =
    "https://api.scryfall.com/cards/search?q=" +
    encodeURIComponent(`e:${set} r<=u`) +
    "&unique=cards&order=color";
  const out = [];
  while (url) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Scryfall HTTP ${res.status}`);
    const page = await res.json();
    for (const c of page.data) {
      out.push({
        name: c.name,
        mana_cost: c.mana_cost ?? c.card_faces?.[0]?.mana_cost ?? "",
        cmc: c.cmc ?? 0,
        type_line: c.type_line ?? "",
        oracle_text:
          c.oracle_text ??
          (c.card_faces || [])
            .map((f) => `${f.name} — ${f.oracle_text || ""}`)
            .join("\n//\n"),
        power: c.power ?? null,
        toughness: c.toughness ?? null,
        colors: c.colors ?? c.card_faces?.[0]?.colors ?? [],
        color_identity: c.color_identity ?? [],
        rarity: c.rarity,
        set: c.set,
        collector_number: c.collector_number,
        scryfall_id: c.id,
        image_url:
          c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal ?? null,
      });
    }
    url = page.has_more ? page.next_page : null;
    await sleep(120);
  }
  return out;
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const source = SOURCES[SET];
if (!source) throw new Error(`No source metadata configured for set "${SET}"`);

const cards = await fetchCards(SET);

// Index canonical names (and split-card front faces) by normalized key.
const byName = new Map();
for (const c of cards) {
  byName.set(norm(c.name), c.name);
  const front = c.name.split(" // ")[0];
  if (!byName.has(norm(front))) byName.set(norm(front), c.name);
}

const grades = new Map();
const unmatched = [];
if (fs.existsSync(GRADES_FILE)) {
  for (const row of JSON.parse(fs.readFileSync(GRADES_FILE, "utf8"))) {
    const canon = byName.get(norm(row.name));
    if (!canon) {
      unmatched.push(row.name);
      continue;
    }
    grades.set(canon, row);
  }
} else {
  console.warn(`! ${path.basename(GRADES_FILE)} not found — grades will be null`);
}

const cycles = CYCLE_GRADES[SET] ?? [];
const merged = cards.map((c) => {
  const g = grades.get(c.name) ?? {};
  const cyc = cycles.find((x) => x.match.test(c.name));
  return {
    ...c,
    marshall: g.marshall ?? cyc?.marshall ?? null,
    luis: g.luis ?? cyc?.luis ?? null,
    tag: g.tag ?? null,
    note: g.note ?? cyc?.note ?? null,
  };
});

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(
  OUT_FILE,
  JSON.stringify(
    {
      set: SET,
      setName: source.setName,
      source: { title: source.title, url: source.url, reviewers: source.reviewers },
      cards: merged,
    },
    null,
    1,
  ),
);

const any = merged.filter((c) => c.marshall || c.luis).length;
console.log(`${path.relative(ROOT, OUT_FILE)}: ${merged.length} cards, ${any} graded`);
if (unmatched.length) console.log(`unmatched grade rows: ${unmatched.join(", ")}`);
