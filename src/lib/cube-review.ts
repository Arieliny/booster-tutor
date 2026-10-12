/**
 * Cube review: compare my cube with LSV's and MTGO's, go through their recent
 * changelogs and a new set, and record Keep / Cut / Add / Maybe decisions.
 *
 * All card data is baked into src/data/cube-review.json by
 * scripts/build-cube-review.mjs, so the tab works fully offline once the app
 * has been loaded. Decisions live in localStorage and move between devices via
 * a JSON export/import that merges per card (newest edit wins).
 */

import raw from "../data/cube-review.json";
import { LOCAL_CHANGE_EVENT } from "./user-sync";

/** Tell the sync engine (lib/user-sync.ts) that something changed on this device. */
const announceLocalChange = () => window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));

export type CubeKey = "mine" | "lsv" | "mtgo";
export type LogKey = "lsv" | "mtgo";

export interface ReviewFace {
  name: string;
  cost?: string;
  type?: string;
  text?: string;
  pt?: string;
  loy?: string;
}

export interface ReviewCard {
  /** Oracle ID — the identity used everywhere, so printings never split a card. */
  id: string;
  sid: string;
  name: string;
  cost: string;
  cmc: number;
  colors: string[];
  ci: string[];
  type: string;
  text: string;
  pt?: string;
  loy?: string;
  rarity: string;
  layout: string;
  faces?: ReviewFace[];
  /** Scryfall "small" front image; other sizes/faces are derived from it. */
  img?: string;
  /** True when the back face has its own image (transform / modal DFCs). */
  back?: boolean;
  /**
   * The cube's own printing, when `img` was switched to the oldest printing.
   * Used as a fallback so an offline device shows the image it already saved.
   */
  cubeImg?: string;
}

export interface ChangelogEntry {
  id: string;
  /** ISO dates (YYYY-MM-DD), oldest first. */
  adds: string[];
  removes: string[];
  /** Still in that cube today. */
  current: boolean;
}

interface CubeInfo {
  label: string;
  name: string;
  cubeId: string;
  updated: string;
  cards: string[];
}

interface CubeReviewData {
  builtAt: string;
  changelogSince: string;
  cubes: Record<CubeKey, CubeInfo>;
  changelogs: Record<LogKey, ChangelogEntry[]>;
  set: { code: string; name: string; released: string; cards: string[] };
  cards: Record<string, ReviewCard>;
}

export const data = raw as unknown as CubeReviewData;

export const CUBE_KEYS: CubeKey[] = ["mine", "lsv", "mtgo"];
export const CUBE_SHORT: Record<CubeKey, string> = { mine: "M", lsv: "L", mtgo: "O" };

export const members: Record<CubeKey, Set<string>> = {
  mine: new Set(data.cubes.mine.cards),
  lsv: new Set(data.cubes.lsv.cards),
  mtgo: new Set(data.cubes.mtgo.cards),
};

export const logById: Record<LogKey, Map<string, ChangelogEntry>> = {
  lsv: new Map(data.changelogs.lsv.map((e) => [e.id, e])),
  mtgo: new Map(data.changelogs.mtgo.map((e) => [e.id, e])),
};

export const setIds = new Set(data.set.cards);

/** Every card in at least one of the three cubes. */
export const cubeUnion: string[] = [
  ...new Set([...data.cubes.mine.cards, ...data.cubes.lsv.cards, ...data.cubes.mtgo.cards]),
];

// ---------------------------------------------------------------- extra cards
//
// Cards added by hand from Scryfall (outside the three cubes and the set).
// Stored with full card data so they keep working offline, and carried in the
// decisions export so the other device can show them too.

const EXTRAS_KEY = "booster-tutor-cube-review-extras-v1";

function loadExtras(): Record<string, ReviewCard> {
  try {
    const s = localStorage.getItem(EXTRAS_KEY);
    return s ? (JSON.parse(s) as Record<string, ReviewCard>) : {};
  } catch {
    return {};
  }
}

const extras: Record<string, ReviewCard> = loadExtras();

function saveExtras(): void {
  try {
    localStorage.setItem(EXTRAS_KEY, JSON.stringify(extras));
  } catch {
    // Blocked storage: the card still works this session.
  }
  announceLocalChange();
}

/** Cards added by hand that aren't already in the baked data. */
export function extraCards(): Record<string, ReviewCard> {
  const out: Record<string, ReviewCard> = {};
  for (const [id, c] of Object.entries(extras)) if (!data.cards[id]) out[id] = c;
  return out;
}

export function isExtra(id: string): boolean {
  return !data.cards[id] && !!extras[id];
}

/**
 * Cards opened from a lookup but not (yet) decided on. Kept in memory only, so
 * browsing the card database doesn't fill "All cards"; tagging or noting one
 * promotes it to a saved extra card (see persistIfLookedUp).
 */
const lookedUp: Record<string, ReviewCard> = {};

export function registerLookup(c: ReviewCard): void {
  if (!data.cards[c.id] && !extras[c.id]) lookedUp[c.id] = c;
}

export function isLookedUp(id: string): boolean {
  return !data.cards[id] && !extras[id] && !!lookedUp[id];
}

/** Save a looked-up card for good; returns true if it was promoted. */
export function persistIfLookedUp(id: string): boolean {
  if (!isLookedUp(id)) return false;
  addExtraCards([lookedUp[id]]);
  delete lookedUp[id];
  return true;
}

/** Add (or update) hand-added cards; returns how many were new. */
export function addExtraCards(cards: ReviewCard[]): number {
  let added = 0;
  for (const c of cards) {
    if (!c?.id || data.cards[c.id]) continue;
    if (!extras[c.id]) added++;
    extras[c.id] = c;
  }
  saveExtras();
  return added;
}

/** Every card id: the baked data plus anything added by hand. */
export function allCardIds(): string[] {
  return [...Object.keys(data.cards), ...Object.keys(extraCards())];
}

export function hasCard(id: string): boolean {
  return !!(data.cards[id] ?? extras[id] ?? lookedUp[id]);
}

export function card(id: string): ReviewCard {
  return data.cards[id] ?? extras[id] ?? lookedUp[id];
}

// ---------------------------------------------------------------- images

export type ImageSize = "small" | "normal";

// ---------------------------------------------------------------- chosen printings
//
// Per-card printing choices ("Change printing" in the popup), keyed by Oracle
// id. Cube review + lookup only. Resetting stores an empty choice with its own
// timestamp, so the reset - not just the pick - carries across devices.

export interface ArtChoice {
  /** Scryfall printing id; empty means "back to the default". */
  sid: string;
  back?: boolean;
  /** e.g. "LEA · 1993", for showing what's chosen. */
  label?: string;
  t: number;
}

const ART_KEY = "booster-tutor-cube-review-art-v1";

function loadArt(): Record<string, ArtChoice> {
  try {
    const s = localStorage.getItem(ART_KEY);
    return s ? (JSON.parse(s) as Record<string, ArtChoice>) : {};
  } catch {
    return {};
  }
}

const artChoices: Record<string, ArtChoice> = loadArt();

function saveArt(): void {
  try {
    localStorage.setItem(ART_KEY, JSON.stringify(artChoices));
  } catch {
    // Blocked storage: the choice still applies this session.
  }
  announceLocalChange();
}

/**
 * After the sync engine merged another device's changes into storage, fold
 * them into this page's in-memory copies: extra cards are add-only, printing
 * choices go newest-wins (never blindly replaced, so an edit made a moment ago
 * here can't be lost).
 */
export function reloadSyncedData(): void {
  for (const [id, c] of Object.entries(loadExtras())) if (!extras[id]) extras[id] = c;
  for (const [id, a] of Object.entries(loadArt())) {
    if (!artChoices[id] || artChoices[id].t < a.t) artChoices[id] = a;
  }
}

export function artChoice(id: string): ArtChoice | undefined {
  const a = artChoices[id];
  return a?.sid ? a : undefined;
}

/** Choose a printing for a card, or pass null to go back to the default. */
export function setArtChoice(id: string, choice: Omit<ArtChoice, "t"> | null): void {
  artChoices[id] = choice ? { ...choice, t: Date.now() } : { sid: "", t: Date.now() };
  saveArt();
}

const smallUrl = (sid: string) => `https://cards.scryfall.io/small/front/${sid[0]}/${sid[1]}/${sid}.jpg`;

function sized(url: string, size: ImageSize, face: "front" | "back") {
  let u = url;
  if (size === "normal") u = u.replace("/small/", "/normal/");
  if (face === "back") u = u.replace("/front/", "/back/");
  return u;
}

/** Whether the shown printing has a separate back-face image. */
export function hasBackImage(c: ReviewCard): boolean {
  const a = artChoice(c.id);
  return a ? !!a.back : !!c.back;
}

export function imageUrl(c: ReviewCard, size: ImageSize, face: "front" | "back" = "front") {
  const a = artChoice(c.id);
  const base = a ? smallUrl(a.sid) : c.img;
  return base ? sized(base, size, face) : null;
}

/**
 * What to show if the chosen/default image can't load (offline, not saved):
 * the default printing when one was chosen, then the cube's own printing.
 */
export function fallbackImageUrls(c: ReviewCard, size: ImageSize, face: "front" | "back" = "front"): string[] {
  const out: string[] = [];
  if (artChoice(c.id) && c.img) out.push(sized(c.img, size, face));
  if (c.cubeImg) out.push(sized(c.cubeImg, size, face));
  return out;
}

/** Every image the offline download should cover, at one size. */
export function allImageUrls(size: ImageSize): string[] {
  const out: string[] = [];
  for (const c of [...Object.values(data.cards), ...Object.values(extraCards())]) {
    const f = imageUrl(c, size);
    if (f) out.push(f);
    if (hasBackImage(c)) {
      const b = imageUrl(c, size, "back");
      if (b) out.push(b);
    }
  }
  return out;
}

// ---------------------------------------------------------------- facets

export type ColorFacet = "W" | "U" | "B" | "R" | "G" | "M" | "C";
export const COLOR_FACETS: ColorFacet[] = ["W", "U", "B", "R", "G", "M", "C"];

/** Colour identity bucket: one colour, multicolour, or colourless. */
export function colorFacet(c: ReviewCard): ColorFacet {
  if (c.ci.length === 0) return "C";
  if (c.ci.length > 1) return "M";
  return c.ci[0] as ColorFacet;
}

export const TYPE_FACETS = [
  "Creature",
  "Planeswalker",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Land",
  "Battle",
] as const;
export type TypeFacet = (typeof TYPE_FACETS)[number];

export function hasType(c: ReviewCard, t: TypeFacet): boolean {
  // The front face decides: an MDFC with a land back is a spell first.
  const front = c.faces?.[0]?.type ?? c.type;
  return front.includes(t);
}

export const CMC_FACETS = ["0", "1", "2", "3", "4", "5", "6", "7+"] as const;
export type CmcFacet = (typeof CMC_FACETS)[number];

export function cmcFacet(c: ReviewCard): CmcFacet {
  const n = Math.floor(c.cmc);
  return n >= 7 ? "7+" : (String(n) as CmcFacet);
}

export const RARITY_FACETS = ["common", "uncommon", "rare", "mythic"] as const;

/** Summary rows: lands get their own row, as cube balance is usually read. */
export type BalanceRow = ColorFacet | "L";
export const BALANCE_ROWS: { id: BalanceRow; label: string }[] = [
  { id: "W", label: "White" },
  { id: "U", label: "Blue" },
  { id: "B", label: "Black" },
  { id: "R", label: "Red" },
  { id: "G", label: "Green" },
  { id: "M", label: "Multicolor" },
  { id: "C", label: "Colorless" },
  { id: "L", label: "Lands" },
];

export function balanceRow(c: ReviewCard): BalanceRow {
  const front = c.faces?.[0]?.type ?? c.type;
  if (front.includes("Land") && !front.includes("Creature")) return "L";
  return colorFacet(c);
}

/** The name Cube Cobra's bulk add/remove matches best. */
export function cubeCobraName(c: ReviewCard): string {
  // Split cards are matched on the full "A // B" name; other multi-face cards
  // (transform, MDFC, adventure) on their front face.
  if (c.layout === "split") return c.name;
  return c.faces?.[0]?.name ?? c.name;
}

export function frontName(c: ReviewCard): string {
  return c.faces?.[0]?.name ?? c.name;
}

export function searchText(c: ReviewCard): string {
  const faces = (c.faces ?? []).map((f) => `${f.name} ${f.type ?? ""} ${f.text ?? ""}`).join(" ");
  return `${c.name} ${c.type} ${c.text} ${faces}`.toLowerCase();
}

export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Adds and removes merged into one chronological history line. */
export function historyEvents(e: ChangelogEntry): { kind: "add" | "cut"; date: string }[] {
  return [
    ...e.adds.map((date) => ({ kind: "add" as const, date })),
    ...e.removes.map((date) => ({ kind: "cut" as const, date })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "add" ? -1 : 1));
}

/** Most recent change date, for "newest first" ordering. */
export function lastChange(e: ChangelogEntry): string {
  const all = [...e.adds, ...e.removes];
  return all.length ? all.reduce((a, b) => (a > b ? a : b)) : "";
}

// ---------------------------------------------------------------- decisions

/**
 * Keep / Cut apply to cards in my cube; Add / No to cards outside it. They're
 * the same yes/no question either way, so they're stored and keyed by meaning
 * and shown in the right words for where the card currently is.
 */
export type Status = "keep" | "cut" | "add" | "no" | "maybe";
export const STATUSES: Status[] = ["keep", "cut", "add", "no", "maybe"];
export const STATUS_LABEL: Record<Status, string> = {
  keep: "Keep",
  cut: "Cut",
  add: "Add",
  no: "No",
  maybe: "Maybe",
};
export const STATUS_SHORTCUT: Record<Status, string> = { keep: "K", cut: "C", add: "A", no: "N", maybe: "M" };

export type Polarity = "yes" | "no" | "maybe";
/** K/A mean "yes" and C/N mean "no" on any card, so either letter works. */
export const KEY_POLARITY: Record<string, Polarity> = { k: "yes", a: "yes", c: "no", n: "no", m: "maybe" };

export function inMyCube(id: string): boolean {
  return members.mine.has(id);
}

/** The status a yes / no / maybe means for this card. */
export function statusFor(id: string, p: Polarity): Status {
  if (p === "maybe") return "maybe";
  const mine = inMyCube(id);
  return p === "yes" ? (mine ? "keep" : "add") : mine ? "cut" : "no";
}

/**
 * The status in the right words for where the card is now — so an old "Cut"
 * on a card I don't run reads "No", and an "Add" on a card that has since
 * joined my cube reads "Keep".
 */
export function normalizeStatus(id: string, s: Status | undefined): Status | undefined {
  if (!s) return undefined;
  if (s === "maybe") return s;
  return statusFor(id, s === "keep" || s === "add" ? "yes" : "no");
}

/** The three buttons a card offers. */
export function choicesFor(id: string): Status[] {
  return inMyCube(id) ? ["keep", "cut", "maybe"] : ["add", "no", "maybe"];
}

export interface Decision {
  status?: Status;
  note?: string;
  /** Last edit time (ms) — import merges keep the newer edit per card. */
  t: number;
}

export type Decisions = Record<string, Decision>;

const STORAGE_KEY = "booster-tutor-cube-review-decisions-v1";

/** Whether localStorage accepts writes here (it can be blocked or full). */
export function storageWritable(): boolean {
  try {
    localStorage.setItem(`${STORAGE_KEY}-probe`, "1");
    localStorage.removeItem(`${STORAGE_KEY}-probe`);
    return true;
  } catch {
    return false;
  }
}

export function loadDecisions(): Decisions {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? (JSON.parse(s) as Decisions) : {};
  } catch {
    return {};
  }
}

export function saveDecisions(d: Decisions): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    announceLocalChange();
    return true;
  } catch {
    return false;
  }
}

/** Per card, the newer edit wins. Used to fold synced changes into the page. */
export function mergeDecisions(current: Decisions, incoming: Decisions): Decisions {
  let changed = false;
  const out: Decisions = { ...current };
  for (const [id, v] of Object.entries(incoming)) {
    if (v && typeof v.t === "number" && (!out[id] || out[id].t < v.t)) {
      out[id] = v;
      changed = true;
    }
  }
  return changed ? out : current;
}

/** Drop entries with neither a status nor a note. */
export function prune(d: Decisions): Decisions {
  const out: Decisions = {};
  for (const [id, v] of Object.entries(d)) if (v.status || v.note) out[id] = v;
  return out;
}

export interface DecisionsFile {
  app: "booster-tutor-cube-review";
  version: 1;
  exportedAt: string;
  decisions: Decisions;
  /** Hand-added cards, so the importing device can show them. */
  extraCards?: Record<string, ReviewCard>;
  /** Chosen printings (incl. resets), merged per card by timestamp. */
  art?: Record<string, ArtChoice>;
}

export function toExportFile(d: Decisions): DecisionsFile {
  return {
    app: "booster-tutor-cube-review",
    version: 1,
    exportedAt: new Date().toISOString(),
    decisions: prune(d),
    extraCards: extraCards(),
    art: { ...artChoices },
  };
}

/**
 * Merge an imported file into the current decisions, card by card: whichever
 * side was edited more recently wins. So importing the phone's file on the
 * laptop (and vice versa) never loses work done on either.
 */
export function mergeImport(
  current: Decisions,
  text: string,
): { merged: Decisions; updated: number; total: number; newCards: number; artUpdated: number } {
  const parsed = JSON.parse(text) as Partial<DecisionsFile>;
  if (parsed?.app !== "booster-tutor-cube-review" || typeof parsed.decisions !== "object") {
    throw new Error("That isn't a Booster Tutor cube review file.");
  }
  const newCards = parsed.extraCards ? addExtraCards(Object.values(parsed.extraCards)) : 0;
  let artUpdated = 0;
  for (const [id, a] of Object.entries(parsed.art ?? {})) {
    if (!a || typeof a.t !== "number") continue;
    if (!artChoices[id] || artChoices[id].t < a.t) {
      artChoices[id] = a;
      artUpdated++;
    }
  }
  if (artUpdated) saveArt();
  const merged: Decisions = { ...current };
  let updated = 0;
  const incoming = parsed.decisions as Decisions;
  for (const [id, v] of Object.entries(incoming)) {
    if (!v || typeof v.t !== "number") continue;
    if (!merged[id] || merged[id].t < v.t) {
      merged[id] = v;
      updated++;
    }
  }
  return { merged: prune(merged), updated, total: Object.keys(incoming).length, newCards, artUpdated };
}

// ---------------------------------------------------------------- summary

export interface Summary {
  counts: Record<Status, number>;
  /** Maybes split by the question they pose: cut it (in my cube) or add it (new). */
  maybeCut: number;
  maybeAdd: number;
  cuts: ReviewCard[];
  adds: ReviewCard[];
  current: number;
  result: number;
  balance: { id: BalanceRow; label: string; now: number; minus: number; plus: number }[];
}

export function summarize(d: Decisions): Summary {
  const counts: Record<Status, number> = { keep: 0, cut: 0, add: 0, no: 0, maybe: 0 };
  let maybeCut = 0;
  let maybeAdd = 0;
  const cuts: ReviewCard[] = [];
  const adds: ReviewCard[] = [];
  for (const [id, v] of Object.entries(d)) {
    const status = normalizeStatus(id, v.status);
    if (!status || !hasCard(id)) continue;
    counts[status]++;
    if (status === "maybe") {
      if (inMyCube(id)) maybeCut++;
      else maybeAdd++;
    }
    if (status === "cut") cuts.push(card(id));
    if (status === "add") adds.push(card(id));
  }
  const byName = (a: ReviewCard, b: ReviewCard) => a.name.localeCompare(b.name);
  cuts.sort(byName);
  adds.sort(byName);

  const balance = BALANCE_ROWS.map((r) => ({ ...r, now: 0, minus: 0, plus: 0 }));
  const row = (c: ReviewCard) => balance.find((b) => b.id === balanceRow(c))!;
  for (const id of members.mine) if (data.cards[id]) row(data.cards[id]).now++;
  for (const c of cuts) row(c).minus++;
  for (const c of adds) row(c).plus++;

  const current = members.mine.size;
  return { counts, maybeCut, maybeAdd, cuts, adds, current, result: current - cuts.length + adds.length, balance };
}

// ---------------------------------------------------------------- Scryfall (online only)

const SCRYFALL = "https://api.scryfall.com";

/** Card-name suggestions as you type. */
export async function scryfallSuggest(q: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${SCRYFALL}/cards/autocomplete?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`Scryfall returned ${res.status}`);
  const j = (await res.json()) as { data?: string[] };
  return j.data ?? [];
}

export interface Printing {
  sid: string;
  set: string;
  setName: string;
  released: string;
  num: string;
  back: boolean;
  /** MTGO/Arena-only printing. */
  digital: boolean;
}

/** Every printing of a card that has an image, oldest first. Needs a connection. */
export async function scryfallPrintings(oracleId: string, signal?: AbortSignal): Promise<Printing[]> {
  const out: Printing[] = [];
  let url: string | null =
    `${SCRYFALL}/cards/search?q=${encodeURIComponent(`oracleid:${oracleId}`)}&unique=prints&order=released&dir=asc`;
  for (let page = 0; url && page < 4; page++) {
    const res: Response = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Scryfall returned ${res.status}`);
    const j = (await res.json()) as {
      data?: (ScryPrinting & { set: string; set_name: string; released_at: string; collector_number: string })[];
      has_more?: boolean;
      next_page?: string;
    };
    for (const p of j.data ?? []) {
      if (!(p.image_uris || p.card_faces?.[0]?.image_uris) || p.layout === "art_series") continue;
      out.push({
        sid: p.id,
        set: p.set.toUpperCase(),
        setName: p.set_name,
        released: p.released_at,
        num: p.collector_number,
        back: !p.image_uris && !!p.card_faces?.[1]?.image_uris,
        digital: !!p.digital,
      });
    }
    url = j.has_more && j.next_page ? j.next_page : null;
  }
  return out;
}

/** One card by exact name, in the same shape as the baked data, with its oldest art. */
export async function scryfallCard(name: string): Promise<ReviewCard> {
  const res = await fetch(`${SCRYFALL}/cards/named?exact=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Scryfall couldn't find "${name}"`);
  const c = fromScryfall(await res.json());
  return withOldestArt(c);
}

interface ScryPrinting {
  id: string;
  digital?: boolean;
  promo?: boolean;
  variation?: boolean;
  oversized?: boolean;
  set_type?: string;
  layout?: string;
  image_uris?: unknown;
  card_faces?: { image_uris?: unknown }[];
}

/**
 * Swap in the card's oldest regular paper printing (same rules as
 * scripts/lib/oldest-printings.mjs). Best effort: on any failure the card keeps
 * Scryfall's default printing.
 */
async function withOldestArt(c: ReviewCard): Promise<ReviewCard> {
  try {
    const q = `oracleid:${c.id} game:paper -is:promo -is:oversized`;
    const res = await fetch(`${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=released&dir=asc`);
    if (!res.ok) return c;
    const { data } = (await res.json()) as { data?: ScryPrinting[] };
    const p = (data ?? []).find(
      (x) =>
        !x.digital &&
        !x.variation &&
        x.set_type !== "memorabilia" &&
        x.layout !== "art_series" &&
        (x.image_uris || x.card_faces?.[0]?.image_uris),
    );
    if (!p || p.id === c.sid) return c;
    return {
      ...c,
      img: `https://cards.scryfall.io/small/front/${p.id[0]}/${p.id[1]}/${p.id}.jpg`,
      back: !p.image_uris && !!p.card_faces?.[1]?.image_uris ? true : undefined,
    };
  } catch {
    return c;
  }
}

interface ScryFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors?: string[];
  oracle_id?: string;
  image_uris?: { small?: string };
}
interface ScryCard extends ScryFace {
  id: string;
  cmc?: number;
  color_identity: string[];
  rarity: string;
  layout: string;
  card_faces?: ScryFace[];
}

/** Mirrors normalize() in scripts/build-cube-review.mjs. */
export function fromScryfall(c: ScryCard): ReviewCard {
  const faces = c.card_faces;
  const frontImg = c.image_uris ?? faces?.[0]?.image_uris;
  const pt = (x: ScryFace) => (x.power != null ? `${x.power}/${x.toughness}` : undefined);
  return {
    id: c.oracle_id ?? faces?.[0]?.oracle_id ?? c.id,
    sid: c.id,
    name: c.name,
    cost: c.mana_cost ?? (faces ?? []).map((f) => f.mana_cost ?? "").join(" // "),
    cmc: c.cmc ?? 0,
    colors: c.colors ?? [...new Set((faces ?? []).flatMap((f) => f.colors ?? []))],
    ci: c.color_identity,
    type: c.type_line ?? (faces ?? []).map((f) => f.type_line ?? "").join(" // "),
    text: c.oracle_text ?? (faces ?? []).map((f) => f.oracle_text ?? "").join("\n//\n"),
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
    img: frontImg?.small,
    back: !c.image_uris && faces?.[1]?.image_uris ? true : undefined,
  };
}
