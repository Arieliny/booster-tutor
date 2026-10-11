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
  loaded = Promise.resolve(db);
  return db;
}

export async function removeDb(): Promise<void> {
  loaded = null;
  writeInfo(null);
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
export function useCardDb() {
  const [state, setState] = useState<DbState>({ kind: "checking" });

  useEffect(() => {
    let live = true;
    void dbInfo().then((info) => {
      if (live) setState(info ? { kind: "ready", info, db: null } : { kind: "absent" });
    });
    return () => {
      live = false;
    };
  }, []);

  const download = useCallback(async () => {
    setState({ kind: "busy", action: "download" });
    try {
      const db = await downloadDb();
      setState({ kind: "ready", info: db.info, db });
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
  }, []);

  return { state, download, load, remove };
}
