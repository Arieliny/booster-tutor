#!/usr/bin/env node
/**
 * Builds the Cube review data file: src/data/cube-review.json
 *
 *   node --use-system-ca scripts/build-cube-review.mjs [--since YYYY-MM-DD] [--soft]
 *
 * Runs on every Vercel deploy (vercel.json buildCommand, with --soft), so the
 * live app always has the cubes and changelogs as of its last deploy. Run it
 * locally too, to refresh the committed copy. The app precaches the data, so
 * it works offline after one visit.
 *
 * --soft: if Cube Cobra or Scryfall fail, or the result looks wrong, keep the
 * committed src/data/cube-review.json and let the build carry on.
 *
 * Sources:
 *  - Cube lists: Cube Cobra /cube/api/cubeJSON/{id}
 *  - Changelogs: Cube Cobra POST /cube/getmorechangelogs {cubeId, lastKey}.
 *    Undocumented (it's what the History page calls), needs no login, pages
 *    newest-first via lastKey. Each post has mainboard adds/removes/swaps keyed
 *    by Scryfall ID.
 *  - Card facts + images: Scryfall /cards/collection (75 per request).
 *  - New set: Scryfall search, main set only (collector number <= printed_size,
 *    one printing per Oracle card).
 *
 * Cards are keyed by ORACLE ID, never by printing - the same card in a
 * different printing in each cube must count as one card.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { oldestPrintings, smallImageUrl } from "./lib/oldest-printings.mjs";

const CONFIG = {
  cubes: [
    { key: "mine", id: "PiemanPoweredCube", label: "My cube" },
    { key: "lsv", id: "PowerLSV", label: "LSV", changelog: true },
    { key: "mtgo", id: "modovintage", label: "MTGO Vintage", changelog: true },
    // MTG Arena's Powered Cube, kept in step with Arena's updates by a Cube Cobra user
    // (checked 2026-10-29: matches Arena's Oct 19 update; its history lines up with Arena's update dates).
    { key: "arena", id: "mtgapc", label: "Arena Powered", changelog: true },
  ],
  changelogSince: "2026-01-01",
  set: "fra",
};

const SOFT = process.argv.includes("--soft");
if (SOFT) {
  process.on("uncaughtException", (err) => {
    console.error(`cube-review: ${err.message}`);
    console.error("cube-review: --soft, keeping the committed src/data/cube-review.json");
    process.exit(0);
  });
}

const argSince = process.argv.indexOf("--since");
if (argSince > 0) CONFIG.changelogSince = process.argv[argSince + 1];

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "cube-review.json");
const UA = "BoosterTutor/1.0 (personal cube review build script)";
const SCRY = { "User-Agent": UA, Accept: "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (ms) => new Date(Number(ms)).toISOString().slice(0, 10);

async function getJSON(url, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, init);
    if (r.status === 429 && attempt < 4) {
      await sleep(1000 * attempt);
      continue;
    }
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} - ${url}`);
    return r.json();
  }
}

// ---------------------------------------------------------------- Cube Cobra
async function fetchCube(id) {
  const j = await getJSON(`https://cubecobra.com/cube/api/cubeJSON/${encodeURIComponent(id)}`, {
    headers: { "User-Agent": UA },
  });
  const sids = (j.cards?.mainboard ?? [])
    .map((c) => c?.details?.scryfall_id ?? c?.cardID)
    .filter((s) => typeof s === "string");
  return { uuid: j.id, name: j.name, updated: day(j.date ?? j.dateLastUpdated), sids };
}

async function fetchChangelog(uuid, sinceMs) {
  const posts = [];
  let lastKey = null;
  for (let page = 0; page < 300; page++) {
    const j = await getJSON("https://cubecobra.com/cube/getmorechangelogs", {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/json" },
      body: JSON.stringify({ cubeId: uuid, lastKey }),
    });
    if (j.success !== "true") throw new Error(`changelog fetch failed for ${uuid}`);
    let reachedOlder = false;
    for (const p of j.posts ?? []) {
      if (Number(p.date) < sinceMs) reachedOlder = true;
      else posts.push(p);
    }
    lastKey = j.lastKey;
    if (reachedOlder || !lastKey) break;
    await sleep(300);
  }
  return posts;
}

/** Per post: Scryfall IDs added to and removed from the mainboard. */
function postChanges(p) {
  const mb = p.changelog?.mainboard;
  const adds = [];
  const removes = [];
  if (!mb) return { adds, removes };
  for (const a of mb.adds ?? []) adds.push(a?.cardID);
  for (const r of mb.removes ?? []) removes.push(r?.oldCard?.cardID);
  for (const s of mb.swaps ?? []) {
    removes.push(s?.oldCard?.cardID);
    adds.push(s?.card?.cardID);
  }
  const ok = (x) => typeof x === "string";
  return { adds: adds.filter(ok), removes: removes.filter(ok) };
}

// ---------------------------------------------------------------- Scryfall
async function fetchCollection(sids) {
  const unique = [...new Set(sids)];
  const found = new Map();
  const missing = [];
  for (let i = 0; i < unique.length; i += 75) {
    const batch = unique.slice(i, i + 75);
    const j = await getJSON("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { ...SCRY, "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
    });
    for (const c of j.data ?? []) found.set(c.id, c);
    for (const n of j.not_found ?? []) missing.push(n.id);
    await sleep(100);
  }
  return { found, missing };
}

const oracleOf = (c) => c.oracle_id ?? c.card_faces?.[0]?.oracle_id;

async function fetchSet(code) {
  const set = await getJSON(`https://api.scryfall.com/sets/${code}`, { headers: SCRY });
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`e:${code}`)}&unique=prints&order=set`;
  const prints = [];
  while (url) {
    const j = await getJSON(url, { headers: SCRY });
    prints.push(...j.data);
    url = j.has_more ? j.next_page : null;
    await sleep(100);
  }
  const limit = set.printed_size ?? Infinity;
  const skipLayouts = ["token", "art_series", "emblem", "double_faced_token"];
  const byOracle = new Map();
  for (const c of prints) {
    const num = /^\d+$/.test(c.collector_number) ? Number(c.collector_number) : Infinity;
    // Basics are in the main set but are never a cube decision.
    if (num > limit || skipLayouts.includes(c.layout) || (c.type_line ?? "").includes("Basic Land")) continue;
    const id = oracleOf(c);
    const prev = byOracle.get(id);
    if (!prev || num < Number(prev.collector_number)) byOracle.set(id, c);
  }
  return { set, prints: prints.length, cards: [...byOracle.values()] };
}

function normalize(c) {
  const faces = c.card_faces;
  const frontImg = c.image_uris ?? faces?.[0]?.image_uris;
  const pt = (x) => (x.power != null ? `${x.power}/${x.toughness}` : undefined);
  const colors = c.colors ?? [...new Set((faces ?? []).flatMap((f) => f.colors ?? []))];
  return {
    id: oracleOf(c),
    sid: c.id,
    name: c.name,
    cost: c.mana_cost ?? (faces ?? []).map((f) => f.mana_cost).join(" // "),
    cmc: c.cmc ?? 0,
    colors,
    ci: c.color_identity,
    type: c.type_line ?? (faces ?? []).map((f) => f.type_line).join(" // "),
    text: c.oracle_text ?? (faces ?? []).map((f) => f.oracle_text).join("\n//\n"),
    pt: pt(c),
    loy: c.loyalty,
    rarity: c.rarity,
    layout: c.layout,
    faces: faces?.map((f) => ({
      name: f.name,
      cost: f.mana_cost,
      type: f.type_line,
      text: f.oracle_text,
      pt: pt(f),
      loy: f.loyalty,
    })),
    // Only the small front URL is stored; the normal size and the back face are
    // the same URL with /small/ -> /normal/ and /front/ -> /back/.
    img: frontImg?.small,
    back: !c.image_uris && faces?.[1]?.image_uris ? true : undefined,
  };
}

// ---------------------------------------------------------------- main
const sinceMs = Date.parse(`${CONFIG.changelogSince}T00:00:00Z`);
console.log(`Building cube review (changelogs since ${CONFIG.changelogSince})\n`);

const cubes = {};
for (const cfg of CONFIG.cubes) {
  const c = await fetchCube(cfg.id);
  cubes[cfg.key] = { ...cfg, ...c };
  if (cfg.changelog) cubes[cfg.key].posts = await fetchChangelog(c.uuid, sinceMs);
  console.log(
    `  ${cfg.label.padEnd(13)} ${String(c.sids.length).padStart(4)} cards` +
      (cfg.changelog ? `   ${cubes[cfg.key].posts.length} changelog posts` : ""),
  );
  await sleep(300);
}

const allSids = Object.values(cubes).flatMap((c) => [
  ...c.sids,
  ...(c.posts ?? []).flatMap((p) => {
    const x = postChanges(p);
    return [...x.adds, ...x.removes];
  }),
]);
// A cube that comes back nearly empty means Cube Cobra changed or failed, not
// that the cube was emptied: never overwrite good data with it.
for (const c of Object.values(cubes)) {
  if (c.sids.length < 200) throw new Error(`${c.label} came back with only ${c.sids.length} cards`);
}

const { found, missing } = await fetchCollection(allSids);
const fra = await fetchSet(CONFIG.set);
console.log(`  Scryfall      ${found.size} printings resolved, ${missing.length} not found`);
console.log(`  ${fra.set.name.padEnd(13)} ${fra.cards.length} main-set cards (from ${fra.prints} printings)\n`);

// Card table keyed by Oracle ID. Display-printing preference: my cube, then LSV,
// then MTGO, then Arena, then anything else - so I see the printing I actually own.
const cards = {};
const put = (c) => {
  const n = normalize(c);
  if (n.id && !cards[n.id]) cards[n.id] = n;
};
for (const key of ["mine", "lsv", "mtgo", "arena"])
  for (const s of cubes[key].sids) if (found.has(s)) put(found.get(s));
for (const c of found.values()) put(c);
for (const c of fra.cards) put(c);

// Owned proxies (scripts/owned-proxies.json, by card name -> orders). A card Ari printed that no cube has is
// looked up on Scryfall and added, so the Bench can show it.
const OWNED = join(dirname(fileURLToPath(import.meta.url)), "owned-proxies.json");
if (existsSync(OWNED)) {
  const owned = JSON.parse(readFileSync(OWNED, "utf8"));
  const byName = () => new Map(Object.values(cards).map((c) => [c.name, c]));
  let names = byName();
  const lookedUp = [];
  const unknownNames = [];
  for (const name of Object.keys(owned)) {
    if (names.has(name)) continue;
    await sleep(150);
    const r = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`, { headers: SCRY });
    if (!r.ok) {
      unknownNames.push(name);
      continue;
    }
    const c = await r.json();
    if (c.layout === "token" || c.set_type === "token") continue;
    put(c);
    lookedUp.push(c.name);
  }
  names = byName();
  let ownedCount = 0;
  for (const [name, orders] of Object.entries(owned)) {
    const c = names.get(name);
    if (c) {
      c.owned = orders;
      ownedCount++;
    }
  }
  console.log(`  Owned         ${ownedCount} cards from proxy orders${lookedUp.length ? `; added from Scryfall: ${lookedUp.join(", ")}` : ""}${unknownNames.length ? `; not real cards: ${unknownNames.join(", ")}` : ""}`);
  // Omenpaths proxies carry the in-universe printed name; keep it as an alias so Ari finds the card by it.
  const ALIASES = join(dirname(fileURLToPath(import.meta.url)), "card-aliases.json");
  if (existsSync(ALIASES)) {
    const aliases = JSON.parse(readFileSync(ALIASES, "utf8"));
    for (const [name, aka] of Object.entries(aliases)) {
      const c = names.get(name);
      if (c) c.aka = aka;
    }
  }
}

// Staples (scripts/staples.json): cards that go in any deck, whatever the archetype. Shown apart from the
// archetype tags; Ari can mark or unmark one in the app.
const STAPLES = join(dirname(fileURLToPath(import.meta.url)), "staples.json");
if (existsSync(STAPLES)) {
  const names = new Map(Object.values(cards).map((c) => [c.name, c]));
  let n = 0;
  const unknown = [];
  for (const name of JSON.parse(readFileSync(STAPLES, "utf8"))) {
    const c = names.get(name);
    if (c) {
      c.staple = true;
      n++;
    } else unknown.push(name);
  }
  console.log(`  Staples       ${n}${unknown.length ? `; not in the data: ${unknown.join(", ")}` : ""}`);
}

// Archetype tags (scripts/archetype-tags.json, by card name: "lands:P" = archetype key + role).
// Baked onto the cards so the app can count support per archetype offline; a decision can override.
const TAGS = join(dirname(fileURLToPath(import.meta.url)), "archetype-tags.json");
let tagged = 0;
if (existsSync(TAGS)) {
  const tags = JSON.parse(readFileSync(TAGS, "utf8"));
  const byName = new Map(Object.values(cards).map((c) => [c.name, c]));
  const unknown = [];
  for (const [name, list] of Object.entries(tags)) {
    const c = byName.get(name);
    if (!c) unknown.push(name);
    else if (list.length) {
      c.tags = list;
      tagged++;
    }
  }
  console.log(`  Tags          ${tagged} cards tagged from ${Object.keys(tags).length} entries${unknown.length ? `; ${unknown.length} names not in the data: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? "..." : ""}` : ""}\n`);
}

const oid = (sid) => (found.has(sid) ? oracleOf(found.get(sid)) : null);

// Artwork. Cards IN MY CUBE keep the printing my cube lists (Ari chose those).
// Every other card defaults to its OLDEST regular printing (he prefers original
// art to newer reprints). The printing it had before is kept as `cubeImg`, so a
// device that saved that image offline still shows it until it re-saves.
const myCube = new Set(cubes.mine.sids.map(oid).filter(Boolean));
const oldest = await oldestPrintings({ userAgent: UA });
let swapped = 0;
for (const c of Object.values(cards)) {
  if (myCube.has(c.id)) continue;
  const o = oldest.get(c.id);
  if (!o || o.sid === c.sid) continue;
  if (c.img) c.cubeImg = c.img;
  c.img = smallImageUrl(o.sid);
  c.back = o.back || undefined;
  swapped++;
}
console.log(`  Oldest art    ${swapped} cards outside my cube switched to their oldest printing (my ${myCube.size} keep theirs)\n`);

const out = {
  builtAt: new Date().toISOString(),
  changelogSince: CONFIG.changelogSince,
  cubes: {},
  changelogs: {},
  set: {
    code: CONFIG.set,
    name: fra.set.name,
    released: fra.set.released_at,
    cards: fra.cards.map(oracleOf),
  },
  cards,
};

const members = {};
for (const [key, c] of Object.entries(cubes)) {
  const ids = [...new Set(c.sids.map(oid).filter(Boolean))];
  members[key] = new Set(ids);
  out.cubes[key] = { label: c.label, name: c.name, cubeId: c.id, updated: c.updated, cards: ids };
}

for (const [key, c] of Object.entries(cubes)) {
  if (!c.posts) continue;
  const log = new Map(); // oracle id -> { adds: [], removes: [] }
  const entry = (id) => {
    if (!log.has(id)) log.set(id, { adds: [], removes: [] });
    return log.get(id);
  };
  for (const p of c.posts) {
    const x = postChanges(p);
    const a = new Set(x.adds.map(oid).filter(Boolean));
    const r = new Set(x.removes.map(oid).filter(Boolean));
    // A remove + add of the same card in one post is a printing change, not a test.
    for (const id of [...a])
      if (r.has(id)) {
        a.delete(id);
        r.delete(id);
      }
    const date = day(p.date);
    for (const id of a) entry(id).adds.push(date);
    for (const id of r) entry(id).removes.push(date);
  }
  out.changelogs[key] = [...log.entries()].map(([id, v]) => ({
    id,
    adds: v.adds.sort(),
    removes: v.removes.sort(),
    current: members[key].has(id),
  }));
}

if (missing.length > allSids.length * 0.05) throw new Error(`Scryfall couldn't find ${missing.length} of ${allSids.length} printings`);
writeFileSync(OUT, JSON.stringify(out));

// ---------------------------------------------------------------- counts
const M = members.mine;
const L = members.lsv;
const O = members.mtgo;
const A = members.arena;
const n = (f) => Object.keys(cards).filter(f).length;
const row = (label, value) => console.log(`  ${String(label).padEnd(34)}${value}`);

console.log("CUBE COMPARISON (unique Oracle cards)");
row("My cube", M.size);
row("LSV", L.size);
row("MTGO Vintage", O.size);
row("Arena Powered", A.size);
row("Only in mine", n((i) => M.has(i) && !L.has(i) && !O.has(i)));
row("Only in LSV", n((i) => L.has(i) && !M.has(i) && !O.has(i)));
row("Only in MTGO", n((i) => O.has(i) && !M.has(i) && !L.has(i)));
row("Mine + LSV (not MTGO)", n((i) => M.has(i) && L.has(i) && !O.has(i)));
row("Mine + MTGO (not LSV)", n((i) => M.has(i) && O.has(i) && !L.has(i)));
row("LSV + MTGO (not mine)", n((i) => L.has(i) && O.has(i) && !M.has(i)));
row("All three", n((i) => M.has(i) && L.has(i) && O.has(i)));
row("In LSV, not mine", n((i) => L.has(i) && !M.has(i)));
row("In mine, not LSV", n((i) => M.has(i) && !L.has(i)));
row("In Arena, not mine", n((i) => A.has(i) && !M.has(i)));
row("In mine, not Arena", n((i) => M.has(i) && !A.has(i)));

for (const key of ["lsv", "mtgo", "arena"]) {
  const log = out.changelogs[key];
  const cur = log.filter((e) => e.current);
  const posts = cubes[key].posts;
  console.log(`\n${cubes[key].label.toUpperCase()} CHANGELOG since ${CONFIG.changelogSince}`);
  row("Posts", posts.length + (posts.length ? `  (${day(posts.at(-1).date)} -> ${day(posts[0].date)})` : ""));
  row("Cards touched", log.length);
  row("  added in window", log.filter((e) => e.adds.length).length);
  row("  removed in window", log.filter((e) => e.removes.length).length);
  row("  current (still in)", cur.length);
  row("  past (cut)", log.length - cur.length);
  row("  added AND later cut", log.filter((e) => e.adds.length && !e.current).length);
  row("  current, not in my cube", cur.filter((e) => !M.has(e.id)).length);
  row("  already in my cube", log.filter((e) => M.has(e.id)).length);
}

const setIds = out.set.cards;
console.log(`\n${fra.set.name.toUpperCase()} (${CONFIG.set})`);
row("Main-set cards", setIds.length);
row("Already in my cube", setIds.filter((i) => M.has(i)).length);
row("In LSV", setIds.filter((i) => L.has(i)).length);
row("In MTGO", setIds.filter((i) => O.has(i)).length);
row("In Arena", setIds.filter((i) => A.has(i)).length);

const total = Object.keys(cards).length;
const images = Object.values(cards).reduce((s, c) => s + (c.back ? 2 : 1), 0);
console.log("\nALL CARDS");
row("Unique cards", total);
row(
  "Images (incl. back faces)",
  `${images}  ~${((images * 12.9) / 1024).toFixed(0)} MB small / ~${((images * 93) / 1024).toFixed(0)} MB normal`,
);
row("Data file", `${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
if (missing.length) console.log(`\n  Not found on Scryfall: ${missing.join(", ")}`);
