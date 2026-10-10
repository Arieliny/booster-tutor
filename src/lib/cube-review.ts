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

export const allIds: string[] = Object.keys(data.cards);

export function card(id: string): ReviewCard {
  return data.cards[id];
}

// ---------------------------------------------------------------- images

export type ImageSize = "small" | "normal";

export function imageUrl(c: ReviewCard, size: ImageSize, face: "front" | "back" = "front") {
  if (!c.img) return null;
  let url = c.img;
  if (size === "normal") url = url.replace("/small/", "/normal/");
  if (face === "back") url = url.replace("/front/", "/back/");
  return url;
}

/** Every image the offline download should cover, at one size. */
export function allImageUrls(size: ImageSize): string[] {
  const out: string[] = [];
  for (const c of Object.values(data.cards)) {
    const f = imageUrl(c, size);
    if (f) out.push(f);
    if (c.back) {
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

export type Status = "keep" | "cut" | "add" | "maybe";
export const STATUSES: Status[] = ["keep", "cut", "add", "maybe"];
export const STATUS_LABEL: Record<Status, string> = {
  keep: "Keep",
  cut: "Cut",
  add: "Add",
  maybe: "Maybe",
};
export const STATUS_KEY: Record<string, Status> = { k: "keep", c: "cut", a: "add", m: "maybe" };

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
    return true;
  } catch {
    return false;
  }
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
}

export function toExportFile(d: Decisions): DecisionsFile {
  return {
    app: "booster-tutor-cube-review",
    version: 1,
    exportedAt: new Date().toISOString(),
    decisions: prune(d),
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
): { merged: Decisions; updated: number; total: number } {
  const parsed = JSON.parse(text) as Partial<DecisionsFile>;
  if (parsed?.app !== "booster-tutor-cube-review" || typeof parsed.decisions !== "object") {
    throw new Error("That isn't a Booster Tutor cube review file.");
  }
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
  return { merged: prune(merged), updated, total: Object.keys(incoming).length };
}

// ---------------------------------------------------------------- summary

export interface Summary {
  counts: Record<Status, number>;
  /** Cuts that apply (card is in my cube) and adds that apply (it isn't). */
  cuts: ReviewCard[];
  adds: ReviewCard[];
  /** Decisions that don't change the cube: a Cut on a card I don't run, etc. */
  ignoredCuts: number;
  ignoredAdds: number;
  current: number;
  result: number;
  balance: { id: BalanceRow; label: string; now: number; minus: number; plus: number }[];
}

export function summarize(d: Decisions): Summary {
  const counts: Record<Status, number> = { keep: 0, cut: 0, add: 0, maybe: 0 };
  const cuts: ReviewCard[] = [];
  const adds: ReviewCard[] = [];
  let ignoredCuts = 0;
  let ignoredAdds = 0;
  for (const [id, v] of Object.entries(d)) {
    if (!v.status || !data.cards[id]) continue;
    counts[v.status]++;
    if (v.status === "cut") {
      if (members.mine.has(id)) cuts.push(data.cards[id]);
      else ignoredCuts++;
    }
    if (v.status === "add") {
      if (!members.mine.has(id)) adds.push(data.cards[id]);
      else ignoredAdds++;
    }
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
  return {
    counts,
    cuts,
    adds,
    ignoredCuts,
    ignoredAdds,
    current,
    result: current - cuts.length + adds.length,
    balance,
  };
}
