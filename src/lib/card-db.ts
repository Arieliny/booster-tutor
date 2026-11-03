/**
 * Offline card database: every real Magic card's text, no images.
 *
 * Built by scripts/build-card-db.mjs during the Vercel build and served as
 * static files under /card-db/ (~4 MB as Vercel sends them, gzip; ~12 MB raw):
 * one part per month of first printing plus index.json, so an update downloads
 * only the parts that changed. It is NOT precached with the app - you download
 * it on demand - and it's kept in its own Cache Storage entry, read directly
 * rather than through the service worker, so lookups work with no connection
 * once downloaded.
 *
 * Loading into memory waits until a search actually needs it, so opening the
 * Cube review tab never pays the ~0.5 s parse on a phone.
 */
import { useCallback, useEffect, useState } from "react";
import type { ReviewCard } from "./cube-review";
import { closestNames, fuzzyIndex, type FuzzyIndex } from "./fuzzy";

export interface DbFace {
  n: string;
  c?: string;
  t?: string;
  o?: string;
  p?: string;
  l?: string;
}

/** Compact card record - field names kept short because there are 34k of them. */
export interface DbCard {
  id: string;
  s: string;
  n: string;
  c?: string;
  t?: string;
  o?: string;
  p?: string;
  l?: string;
  i: string;
  m: number;
  r: string;
  y?: string;
  b?: 1;
  f?: DbFace[];
}

/** One part of the database: the cards first printed in one month (scripts/lib/card-db-parts.mjs). */
export interface DbPart {
  key: string;
  /** Under /card-db/; named by a hash of its content, so a new name means new content. */
  file: string;
  count: number;
  /** Its size gzipped, about what downloading it costs. */
  gz: number;
}

/** /card-db/index.json: what the site's database is made of. */
export interface DbIndex {
  builtAt: string;
  source?: string;
  count: number;
  /** A hash of all the parts: equal versions are the same cards. */
  version: string;
  parts: DbPart[];
}

/** Before the database came in parts (Nov 2026): one file, still read until its first update. */
interface LegacyDoc {
  builtAt: string;
  count: number;
  cards: DbCard[];
}

export interface DbInfo {
  builtAt: string;
  count: number;
  /** "" for the old one-file database, so any site version counts as an update. */
  version: string;
}

export interface CardDb {
  info: DbInfo;
  cards: DbCard[];
  names: string[];
  hay: string[];
}

const DIR = "/card-db/";
const INDEX_URL = DIR + "index.json";
const LEGACY_URL = "/card-db.json";
const CACHE = "booster-tutor-card-db";
const LEGACY_INFO_KEY = "booster-tutor-card-db-info";

/**
 * What a first download costs, for every place one can start. Vercel sends the
 * parts gzipped (4.1 MB for 34.6k cards, measured 2026-11-02; it grows slowly
 * with each set): re-measure if it drifts. Updates show their own size.
 */
export const DB_DOWNLOAD_LABEL = "~4 MB";

/** "~50 KB" or "~3.8 MB" for a download of `bytes`. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1e6) return `~${Math.max(10, Math.round(bytes / 1e4) * 10)} KB`;
  const mb = bytes / 1e6;
  return `~${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

const cachesOk = () => typeof caches !== "undefined";
const NOT_ON_SITE = "The card database isn't available on this version of the site.";

const info = (doc: { builtAt: string; count: number }, version: string): DbInfo => ({ builtAt: doc.builtAt, count: doc.count, version });

function readLegacyInfo(): DbInfo {
  try {
    const s = localStorage.getItem(LEGACY_INFO_KEY);
    if (s) return { ...(JSON.parse(s) as DbInfo), version: "" };
  } catch {
    // Unknown: shown as "Downloaded", and the next check updates it.
  }
  return { builtAt: "", count: 0, version: "" };
}

function parseIndex(text: string): DbIndex {
  let index: DbIndex;
  try {
    index = JSON.parse(text) as DbIndex;
  } catch {
    // A deploy whose build couldn't reach Scryfall has no database, and the SPA
    // rewrite then answers with the HTML shell.
    throw new Error(NOT_ON_SITE);
  }
  if (!Array.isArray(index?.parts) || index.parts.length === 0 || !index.version) throw new Error(NOT_ON_SITE);
  return index;
}

function parseCards(text: string): DbCard[] {
  let cards: unknown;
  try {
    cards = JSON.parse(text);
  } catch {
    throw new Error(NOT_ON_SITE);
  }
  if (!Array.isArray(cards)) throw new Error(NOT_ON_SITE);
  return cards as DbCard[];
}

async function installedIndex(cache: Cache): Promise<DbIndex | null> {
  const hit = await cache.match(INDEX_URL);
  return hit ? parseIndex(await hit.text()) : null;
}

/** What's downloaded on this device, or null. Reads only the small index. */
export async function dbInfo(): Promise<DbInfo | null> {
  if (!cachesOk()) return null;
  try {
    const cache = await caches.open(CACHE);
    const index = await installedIndex(cache);
    if (index) return info(index, index.version);
    return (await cache.match(LEGACY_URL)) ? readLegacyInfo() : null;
  } catch {
    return null;
  }
}

/** Part files this device has, by name. */
async function cachedFiles(cache: Cache): Promise<Set<string>> {
  const files = new Set<string>();
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith(DIR) && path !== INDEX_URL) files.add(path.slice(DIR.length));
  }
  return files;
}

/** The parts of the site's database this device lacks, and what downloading them costs. */
export function planUpdate(site: DbIndex, have: Set<string>): { missing: DbPart[]; bytes: number } {
  const missing = site.parts.filter((p) => !have.has(p.file));
  return { missing, bytes: missing.reduce((n, p) => n + p.gz, 0) };
}

function indexCards(cards: DbCard[], meta: DbInfo): CardDb {
  // Search ranks within a tier in this order: by id, as the one-file database was.
  cards.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const names = cards.map((c) => c.n.toLowerCase());
  const hay = cards.map((c) =>
    `${c.n} ${c.t ?? ""} ${c.o ?? ""} ${(c.f ?? []).map((f) => `${f.t ?? ""} ${f.o ?? ""}`).join(" ")}`.toLowerCase(),
  );
  return { info: meta, cards, names, hay };
}

/** Every part's cards, from `fresh` (just downloaded) or the cache. */
async function readParts(cache: Cache, index: DbIndex, fresh = new Map<string, string>()): Promise<DbCard[]> {
  const lists = await Promise.all(
    index.parts.map(async (p) => {
      const text = fresh.get(p.file) ?? (await (await cache.match(DIR + p.file))?.text());
      if (text === undefined) throw new Error("Part of the card database is missing on this device. Update it to fix that.");
      return parseCards(text);
    }),
  );
  return lists.flat();
}

let loaded: Promise<CardDb | null> | null = null;

/** Parse + index the downloaded database (once per page load). */
export function loadDb(): Promise<CardDb | null> {
  if (!loaded) {
    loaded = (async () => {
      if (!cachesOk()) return null;
      const cache = await caches.open(CACHE);
      const index = await installedIndex(cache);
      if (index) return indexCards(await readParts(cache, index), info(index, index.version));
      const legacy = await cache.match(LEGACY_URL);
      if (!legacy) return null;
      let doc: LegacyDoc;
      try {
        doc = JSON.parse(await legacy.text()) as LegacyDoc;
      } catch {
        throw new Error("The card database on this device is damaged. Update it to fix that.");
      }
      return indexCards(doc.cards ?? [], { ...readLegacyInfo(), count: doc.count, builtAt: doc.builtAt });
    })().catch((err) => {
      loaded = null; // let a later attempt retry
      throw err;
    });
  }
  return loaded;
}

async function fetchIndex(): Promise<DbIndex> {
  const res = await fetch(INDEX_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
  return parseIndex(await res.text());
}

/**
 * Download the database, or update it: only the parts this device doesn't
 * have. The index is written last and old parts removed after it, so a
 * download cut short leaves the previous database whole. `site`: the index a
 * check just fetched, so it isn't fetched twice.
 */
export async function downloadDb(site?: DbIndex): Promise<CardDb> {
  if (!cachesOk()) throw new Error("This browser can't store files for offline use.");
  void navigator.storage?.persist?.().catch(() => undefined);
  const index = site ?? (await fetchIndex());
  const cache = await caches.open(CACHE);
  const { missing } = planUpdate(index, await cachedFiles(cache));
  const fresh = new Map<string, string>();
  // ~220 small files on a first download: a few at a time, not all at once.
  const queue = [...missing];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const res = await fetch(DIR + p.file);
      if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
      const text = await res.text();
      parseCards(text); // a part that doesn't parse never gets kept
      fresh.set(p.file, text);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  const cards = await readParts(cache, index, fresh);
  for (const [file, text] of fresh) await cache.put(DIR + file, new Response(text, { headers: { "Content-Type": "application/json" } }));
  await cache.put(INDEX_URL, new Response(JSON.stringify(index), { headers: { "Content-Type": "application/json" } }));
  const keep = new Set(index.parts.map((p) => DIR + p.file).concat(INDEX_URL));
  for (const req of await cache.keys()) if (!keep.has(new URL(req.url).pathname)) await cache.delete(req);
  try {
    localStorage.removeItem(LEGACY_INFO_KEY);
  } catch {
    // Only the old one-file database read it.
  }
  writeNewer(null);
  const db = indexCards(cards, info(index, index.version));
  loaded = Promise.resolve(db);
  return db;
}

const CHECKED_KEY = "booster-tutor-card-db-checked";
const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;
const WIFI_ONLY_KEY = "booster-tutor-card-db-wifi-only";
/** A different database the site has, found by a check but not downloaded yet, and what updating to it costs. */
const NEWER_KEY = "booster-tutor-card-db-newer";

export interface Newer {
  version: string;
  bytes: number;
}

function readNewer(): Newer | null {
  try {
    const n = JSON.parse(localStorage.getItem(NEWER_KEY) ?? "null") as Newer | null;
    return n && typeof n.version === "string" && typeof n.bytes === "number" ? n : null;
  } catch {
    return null; // nothing, or the build time an older version of the app kept here
  }
}

function writeNewer(newer: Newer | null) {
  try {
    if (newer) localStorage.setItem(NEWER_KEY, JSON.stringify(newer));
    else localStorage.removeItem(NEWER_KEY);
  } catch {
    // Without storage the next check finds it again.
  }
}

/** Automatic updates on Wi-Fi only (the default), or on any connection. */
export function loadWifiOnly(): boolean {
  try {
    return localStorage.getItem(WIFI_ONLY_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveWifiOnly(on: boolean) {
  try {
    if (on) localStorage.removeItem(WIFI_ONLY_KEY);
    else localStorage.setItem(WIFI_ONLY_KEY, "0");
  } catch {
    // Blocked storage: the default (Wi-Fi only) stands.
  }
}

type Connection = { type?: string; saveData?: boolean; addEventListener?: (e: "change", f: () => void) => void; removeEventListener?: (e: "change", f: () => void) => void };
/** Chrome's Network Information API; Safari and Firefox don't have it. */
export const connection = (): Connection | undefined => (navigator as Navigator & { connection?: Connection }).connection;

/**
 * May an automatic update download on this connection? `type` is what Chrome
 * reports ("wifi", "ethernet", "cellular"...). Browsers that don't say (iPhones,
 * Firefox) are taken as mobile data on a touch device, so Wi-Fi only stays a
 * promise, and as a home connection on a computer.
 */
export function networkAllows(wifiOnly: boolean, type: string | undefined, touch: boolean): boolean {
  if (!wifiOnly) return true;
  if (type === "wifi" || type === "ethernet") return true;
  if (type === "cellular" || type === "bluetooth" || type === "wimax") return false;
  return !touch;
}

/**
 * True when the site's database has different cards from this device's. By
 * content, not build time: every deploy rebuilds the database, and a deploy
 * that changed only the app must not send every phone a download.
 */
export function hasUpdate(siteVersion: string | undefined, mine: string): boolean {
  return !!siteVersion && siteVersion !== mine;
}

/**
 * If this device keeps the database and the site now has different cards (a
 * new set, new previews, errata: the site rebuilds itself, see
 * api/_data-refresh.ts), download the parts that changed in the background.
 *
 * The check is the small index, so it runs on any connection (at most every 12
 * hours, only when online) and remembers an update it finds, which screens show
 * as a notice with its size. The download waits for Wi-Fi unless the person
 * turned that off in Settings, and for the phone not to be saving data.
 * Never throws.
 */
export async function refreshDbIfNewer(now = Date.now()): Promise<CardDb | null> {
  try {
    if (!cachesOk() || !navigator.onLine) return null;
    const mine = await dbInfo();
    if (!mine) return null; // never downloaded here: nothing to keep current
    let newer = readNewer();
    let site: DbIndex | undefined;
    const last = Number(localStorage.getItem(CHECKED_KEY) ?? 0);
    if (now - last >= CHECK_EVERY_MS) {
      localStorage.setItem(CHECKED_KEY, String(now));
      site = await fetchIndex();
      newer = hasUpdate(site.version, mine.version)
        ? { version: site.version, bytes: planUpdate(site, await cachedFiles(await caches.open(CACHE))).bytes }
        : null;
      writeNewer(newer);
      announce();
    }
    if (!newer || !hasUpdate(newer.version, mine.version)) return null;
    const net = connection();
    if (net?.saveData) return null;
    if (!networkAllows(loadWifiOnly(), net?.type, window.matchMedia("(pointer: coarse)").matches)) return null;
    const db = await downloadDb(site);
    announce();
    return db;
  } catch {
    return null; // a site with no database, offline mid-way: try again later
  }
}

/**
 * Keeps this device's database current: on opening, and again when the device
 * comes back online or changes network (e.g. joins Wi-Fi). Mount once per app.
 */
export function useCardDbAutoUpdate() {
  useEffect(() => {
    const check = () => void refreshDbIfNewer();
    check();
    const net = connection();
    window.addEventListener("online", check);
    net?.addEventListener?.("change", check);
    return () => {
      window.removeEventListener("online", check);
      net?.removeEventListener?.("change", check);
    };
  }, []);
}

export async function removeDb(): Promise<void> {
  loaded = null;
  try {
    localStorage.removeItem(LEGACY_INFO_KEY);
  } catch {
    // Only the old one-file database read it.
  }
  writeNewer(null);
  if (cachesOk()) await caches.delete(CACHE);
}

/**
 * Name matches first (exact, then starts-with, then contains), then rules-text
 * matches. Skips ids in `exclude` (cards already on screen). `named` says
 * whether any card's name has the text in it, on screen or not: when none
 * does, the search offers "Did you mean ...?" (didYouMean).
 */
export function searchDb(
  db: CardDb,
  q: string,
  limit: number,
  exclude: Set<string>,
): { cards: DbCard[]; total: number; named: boolean } {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return { cards: [], total: 0, named: false };
  const tiers: number[][] = [[], [], [], []];
  let named = false;
  for (let k = 0; k < db.cards.length; k++) {
    const name = db.names[k];
    const tier = name === needle || name.split(" // ").includes(needle) ? 0 : name.startsWith(needle) ? 1 : name.includes(needle) ? 2 : -1;
    if (tier >= 0) named = true;
    if (exclude.has(db.cards[k].id)) continue;
    if (tier >= 0) tiers[tier].push(k);
    else if (db.hay[k].includes(needle)) tiers[3].push(k);
  }
  const all = tiers.flat();
  return { cards: all.slice(0, limit).map((k) => db.cards[k]), total: all.length, named };
}

/** Built the first time a search needs it (~0.1 s), then kept with the database. */
const fuzzyIndexes = new WeakMap<CardDb, FuzzyIndex>();

/** The cards whose names are a few typos from `q`, best first (lib/fuzzy.ts). */
export function didYouMean(db: CardDb, q: string, limit = 3, exclude?: Set<string>): DbCard[] {
  let index = fuzzyIndexes.get(db);
  if (!index) {
    index = fuzzyIndex(db.cards.map((c) => c.n));
    fuzzyIndexes.set(db, index);
  }
  return closestNames(index, q, limit, exclude?.size ? (k) => exclude.has(db.cards[k].id) : undefined).map((h) => db.cards[h.index]);
}

const RARITY: Record<string, string> = {
  c: "common",
  u: "uncommon",
  r: "rare",
  m: "mythic",
  s: "special",
  b: "bonus",
};

/** Expand a compact record into the shape the rest of the cube review uses. */
export function toReviewCard(d: DbCard): ReviewCard {
  const faces = d.f;
  return {
    id: d.id,
    sid: d.s,
    name: d.n,
    cost: d.c ?? (faces ?? []).map((f) => f.c ?? "").join(" // "),
    cmc: d.m,
    colors: d.i.split(""),
    ci: d.i.split(""),
    type: d.t ?? (faces ?? []).map((f) => f.t ?? "").join(" // "),
    text: d.o ?? (faces ?? []).map((f) => f.o ?? "").join("\n//\n"),
    pt: d.p,
    loy: d.l,
    rarity: RARITY[d.r] ?? d.r,
    layout: d.y ?? "normal",
    faces: faces?.map((f) => ({ name: f.n, cost: f.c, type: f.t, text: f.o, pt: f.p, loy: f.l })),
    img: `https://cards.scryfall.io/small/front/${d.s[0]}/${d.s[1]}/${d.s}.jpg`,
    back: d.b ? true : undefined,
  };
}

export type DbState =
  | { kind: "checking" }
  | { kind: "absent" }
  | { kind: "busy"; action: "download" | "load" }
  | { kind: "ready"; info: DbInfo; db: CardDb | null }
  | { kind: "error"; message: string; info: DbInfo | null };

/** Download state + the parsed database, shared by the lookup and its panel. */
/** Fired when the database is downloaded or removed, so every screen using it catches up (e.g. Settings vs Look up). */
const CHANGED = "bt-card-db-changed";
function announce() {
  window.dispatchEvent(new Event(CHANGED));
}

export function useCardDb() {
  const [state, setState] = useState<DbState>({ kind: "checking" });
  const [newer, setNewer] = useState(readNewer);

  useEffect(() => {
    let live = true;
    const check = () =>
      void dbInfo().then((info) => {
        if (!live) return;
        setNewer(readNewer());
        setState((s) => (info ? { kind: "ready", info, db: s.kind === "ready" && s.info.version === info.version ? s.db : null } : { kind: "absent" }));
      });
    check();
    window.addEventListener(CHANGED, check);
    return () => {
      live = false;
      window.removeEventListener(CHANGED, check);
    };
  }, []);

  const [upToDate, setUpToDate] = useState(false);

  /** Download, or update: only what changed, so with nothing new it just finds that out. */
  const download = useCallback(async () => {
    const before = await dbInfo();
    setState({ kind: "busy", action: "download" });
    try {
      const db = await downloadDb();
      setUpToDate(!!before && before.version === db.info.version);
      setState({ kind: "ready", info: db.info, db });
      window.dispatchEvent(new Event(CHANGED));
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err), info: null });
    }
  }, []);

  /** Parse into memory - called the first time a search needs it. */
  const load = useCallback(async () => {
    try {
      const db = await loadDb();
      setState((s) => (db ? { kind: "ready", info: db.info, db } : s.kind === "ready" ? { kind: "absent" } : s));
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err), info: null });
    }
  }, []);

  const remove = useCallback(async () => {
    await removeDb();
    setState({ kind: "absent" });
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  /** The site has different cards from this device's, not downloaded yet. */
  const updateWaiting = state.kind === "ready" && !!newer && hasUpdate(newer.version, state.info.version);
  /** What that update downloads, e.g. "~0.3 MB". */
  const updateLabel = updateWaiting && newer ? sizeLabel(newer.bytes) : null;

  return { state, download, load, remove, updateWaiting, updateLabel, upToDate };
}
