/**
 * The deck randomizer's deck list: for game nights with lots of decks, deal
 * each player (2-4) a different random deck.
 *
 * The list lives in localStorage and, for the owner, syncs across devices with
 * the rest of their account data (lib/user-sync.ts): each deck is an entry with
 * its own edit time `t`, so the newer edit of a deck wins, and a deleted deck is
 * a stamped "deleted" entry so deleting syncs too.
 */
import { LOCAL_CHANGE_EVENT, REMOTE_CHANGE_EVENT } from "./user-sync";

export const DECKS_KEY = "booster-tutor-decks-v1";
export const MIN_SEATS = 2;
export const MAX_SEATS = 4;

export interface Deck {
  t: number;
  name: string;
  /** In the pool the dealer picks from (off: lent out, being rebuilt...). */
  active: boolean;
  deleted?: boolean;
}

export type DeckMap = Record<string, Deck>;

export function loadDecks(): DeckMap {
  try {
    const v = JSON.parse(localStorage.getItem(DECKS_KEY) ?? "{}") as DeckMap;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function saveDecks(map: DeckMap): void {
  try {
    localStorage.setItem(DECKS_KEY, JSON.stringify(map));
  } catch {
    // Blocked storage: the list still works until the page closes.
  }
  window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
}

/** Fires when another device's changes arrive. Returns the unsubscribe. */
export function onRemoteDecks(fn: () => void): () => void {
  window.addEventListener(REMOTE_CHANGE_EVENT, fn);
  return () => window.removeEventListener(REMOTE_CHANGE_EVENT, fn);
}

/** The decks still on the list (not deleted), A to Z. */
export function listDecks(map: DeckMap): (Deck & { id: string })[] {
  return Object.entries(map)
    .filter(([, d]) => d && !d.deleted && typeof d.name === "string")
    .map(([id, d]) => ({ ...d, id }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

const norm = (name: string) => name.trim().replace(/\s+/g, " ");

/**
 * Add decks, one per line (pasting a whole list works). Blank lines and names
 * already on the list (any capitalisation) are skipped. Returns the new map
 * and how many were added.
 */
export function addDecks(map: DeckMap, text: string, now: number, newId: () => string): { map: DeckMap; added: number } {
  const have = new Set(listDecks(map).map((d) => d.name.toLowerCase()));
  const next = { ...map };
  let added = 0;
  for (const line of text.split(/\r?\n/)) {
    const name = norm(line);
    if (!name || name.length > 80 || have.has(name.toLowerCase())) continue;
    have.add(name.toLowerCase());
    next[newId()] = { t: now, name, active: true };
    added++;
  }
  return { map: next, added };
}

export function renameDeck(map: DeckMap, id: string, name: string, now: number): DeckMap {
  const n = norm(name);
  if (!map[id] || !n || n === map[id].name) return map;
  return { ...map, [id]: { ...map[id], name: n.slice(0, 80), t: now } };
}

export function setActive(map: DeckMap, id: string, active: boolean, now: number): DeckMap {
  if (!map[id] || map[id].active === active) return map;
  return { ...map, [id]: { ...map[id], active, t: now } };
}

/** Deleting keeps a stamped tombstone, so the deletion syncs to other devices. */
export function deleteDeck(map: DeckMap, id: string, now: number): DeckMap {
  if (!map[id]) return map;
  return { ...map, [id]: { ...map[id], deleted: true, t: now } };
}

/** One different random deck per seat (needs at least as many decks as seats). */
export function deal(pool: string[], seats: number, random = Math.random): string[] {
  if (pool.length < seats) return [];
  const a = [...pool];
  // Partial Fisher-Yates: the first `seats` slots end up a uniform random pick.
  for (let i = 0; i < seats; i++) {
    const j = i + Math.floor(random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, seats);
}

export function newDeckId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
