/**
 * Offline card database: every real Magic card's text, no images.
 *
 * Built by scripts/build-card-db.mjs during the Vercel build and served as the
 * static file /card-db.json (~1.7 MB compressed, ~11 MB parsed). It is NOT
 * precached with the app - you download it on demand - and it's kept in its own
 * Cache Storage entry, read directly rather than through the service worker, so
 * lookups work with no connection once downloaded.
 *
 * Loading into memory waits until a search actually needs it, so opening the
 * Cube review tab never pays the ~0.5 s parse on a phone.
 */
import { useCallback, useEffect, useState } from "react";
import type { ReviewCard } from "./cube-review";

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

interface DbDoc {
  builtAt: string;
  source?: string;
  count: number;
  cards: DbCard[];
}

export interface DbInfo {
  builtAt: string;
  count: number;
}

export interface CardDb {
  info: DbInfo;
  cards: DbCard[];
  names: string[];
  hay: string[];
}

const DB_URL = "/card-db.json";
const CACHE = "booster-tutor-card-db";
const INFO_KEY = "booster-tutor-card-db-info";

/** Rough compressed download size, for the button label. */
export const DB_DOWNLOAD_LABEL = "~1.7 MB";

const cachesOk = () => typeof caches !== "undefined";

function readInfo(): DbInfo | null {
  try {
    const s = localStorage.getItem(INFO_KEY);
    return s ? (JSON.parse(s) as DbInfo) : null;
  } catch {
    return null;
  }
}

function writeInfo(info: DbInfo | null) {
  try {
    if (info) localStorage.setItem(INFO_KEY, JSON.stringify(info));
    else localStorage.removeItem(INFO_KEY);
  } catch {
    // Info is a convenience; the cache itself is the source of truth.
  }
}

/** What's downloaded on this device, or null. Doesn't read the file itself. */
export async function dbInfo(): Promise<DbInfo | null> {
  if (!cachesOk()) return null;
  try {
    const hit = await (await caches.open(CACHE)).match(DB_URL);
    if (!hit) return null;
    return readInfo() ?? { builtAt: "", count: 0 };
  } catch {
    return null;
  }
}

function indexDoc(doc: DbDoc): CardDb {
  const names = doc.cards.map((c) => c.n.toLowerCase());
  const hay = doc.cards.map((c) =>
    `${c.n} ${c.t ?? ""} ${c.o ?? ""} ${(c.f ?? []).map((f) => `${f.t ?? ""} ${f.o ?? ""}`).join(" ")}`.toLowerCase(),
  );
  return { info: { builtAt: doc.builtAt, count: doc.count }, cards: doc.cards, names, hay };
}

function parseDoc(text: string): DbDoc {
  let doc: DbDoc;
  try {
    doc = JSON.parse(text) as DbDoc;
  } catch {
    // A deploy whose build couldn't reach Scryfall has no file, and the SPA
    // rewrite then answers /card-db.json with the HTML shell.
    throw new Error("The card database isn't available on this version of the site.");
  }
  if (!Array.isArray(doc?.cards) || doc.cards.length === 0) {
    throw new Error("The card database file is empty.");
  }
  return doc;
}

let loaded: Promise<CardDb | null> | null = null;

/** Parse + index the downloaded database (once per page load). */
export function loadDb(): Promise<CardDb | null> {
  if (!loaded) {
    loaded = (async () => {
      if (!cachesOk()) return null;
      const hit = await (await caches.open(CACHE)).match(DB_URL);
      if (!hit) return null;
      return indexDoc(parseDoc(await hit.text()));
    })().catch((err) => {
      loaded = null; // let a later attempt retry
      throw err;
    });
  }
  return loaded;
}

/** Download (or update) the database and keep it for offline use. */
export async function downloadDb(): Promise<CardDb> {
  if (!cachesOk()) throw new Error("This browser can't store files for offline use.");
  void navigator.storage?.persist?.().catch(() => undefined);
  const res = await fetch(DB_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
  const text = await res.text();
  const db = indexDoc(parseDoc(text));
  const cache = await caches.open(CACHE);
  await cache.put(DB_URL, new Response(text, { headers: { "Content-Type": "application/json" } }));
  writeInfo(db.info);
  writeNewer(null);
  loaded = Promise.resolve(db);
  return db;
}

const CHECKED_KEY = "booster-tutor-card-db-checked";
const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;
const WIFI_ONLY_KEY = "booster-tutor-card-db-wifi-only";
/** The build time of a newer database the site has, found by a check but not downloaded yet. */
const NEWER_KEY = "booster-tutor-card-db-newer";

function readNewer(): string | null {
  try {
    return localStorage.getItem(NEWER_KEY);
  } catch {
    return null;
  }
}

function writeNewer(builtAt: string | null) {
  try {
    if (builtAt) localStorage.setItem(NEWER_KEY, builtAt);
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

/** True when the deployed database was built after the one on this device. */
export function isNewer(deployedBuiltAt: string | undefined, mine: string): boolean {
  return !!deployedBuiltAt && deployedBuiltAt > mine;
}

/**
 * If this device keeps the database and the site now has a newer one (a new
 * set, new previews, errata: the site rebuilds itself, see api/_data-refresh.ts),
 * download it in the background.
 *
 * The check is a tiny file, so it runs on any connection (at most every 12
 * hours, only when online) and remembers a newer database it finds, which
 * screens show as a notice. The download (~1.7 MB) waits for Wi-Fi unless the
 * person turned that off in Settings, and for the phone not to be saving data.
 * Never throws.
 */
export async function refreshDbIfNewer(now = Date.now()): Promise<CardDb | null> {
  try {
    if (!cachesOk() || !navigator.onLine) return null;
    const mine = await dbInfo();
    if (!mine) return null; // never downloaded here: nothing to keep current
    let deployed = readNewer();
    const last = Number(localStorage.getItem(CHECKED_KEY) ?? 0);
    if (now - last >= CHECK_EVERY_MS) {
      localStorage.setItem(CHECKED_KEY, String(now));
      const res = await fetch("/data-version.json", { cache: "no-store" });
      if (res.ok) {
        const v = (await res.json()) as { cards?: { builtAt?: string } | null };
        deployed = isNewer(v.cards?.builtAt, mine.builtAt) ? (v.cards?.builtAt ?? null) : null;
        writeNewer(deployed);
        announce();
      }
    }
    if (!deployed || !isNewer(deployed, mine.builtAt)) return null;
    const net = connection();
    if (net?.saveData) return null;
    if (!networkAllows(loadWifiOnly(), net?.type, window.matchMedia("(pointer: coarse)").matches)) return null;
    const db = await downloadDb();
    announce();
    return db;
  } catch {
    return null; // an older site with no version file, offline mid-way: try again later
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
  writeInfo(null);
  writeNewer(null);
  if (cachesOk()) await caches.delete(CACHE);
}

/**
 * Name matches first (exact, then starts-with, then contains), then rules-text
 * matches. Skips ids in `exclude` (cards already on screen).
 */
export function searchDb(
  db: CardDb,
  q: string,
  limit: number,
  exclude: Set<string>,
): { cards: DbCard[]; total: number } {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return { cards: [], total: 0 };
  const tiers: number[][] = [[], [], [], []];
  for (let k = 0; k < db.cards.length; k++) {
    if (exclude.has(db.cards[k].id)) continue;
    const name = db.names[k];
    if (name === needle || name.split(" // ").includes(needle)) tiers[0].push(k);
    else if (name.startsWith(needle)) tiers[1].push(k);
    else if (name.includes(needle)) tiers[2].push(k);
    else if (db.hay[k].includes(needle)) tiers[3].push(k);
  }
  const all = tiers.flat();
  return { cards: all.slice(0, limit).map((k) => db.cards[k]), total: all.length };
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
        setState((s) => (info ? { kind: "ready", info, db: s.kind === "ready" && s.info.builtAt === info.builtAt ? s.db : null } : { kind: "absent" }));
      });
    check();
    window.addEventListener(CHANGED, check);
    return () => {
      live = false;
      window.removeEventListener(CHANGED, check);
    };
  }, []);

  const download = useCallback(async () => {
    setState({ kind: "busy", action: "download" });
    try {
      const db = await downloadDb();
      setState({ kind: "ready", info: db.info, db });
      window.dispatchEvent(new Event(CHANGED));
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err), info: readInfo() });
    }
  }, []);

  /** Parse into memory - called the first time a search needs it. */
  const load = useCallback(async () => {
    try {
      const db = await loadDb();
      setState((s) => (db ? { kind: "ready", info: db.info, db } : s.kind === "ready" ? { kind: "absent" } : s));
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err), info: readInfo() });
    }
  }, []);

  const remove = useCallback(async () => {
    await removeDb();
    setState({ kind: "absent" });
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  /** The site has a newer database than this device's, not downloaded yet. */
  const updateWaiting = state.kind === "ready" && !!newer && isNewer(newer, state.info.builtAt);

  return { state, download, load, remove, updateWaiting };
}
