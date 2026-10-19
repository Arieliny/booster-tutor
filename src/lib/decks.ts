/**
 * The deck randomizer: for game nights with lots of decks, deal each player
 * (2-4) a different random deck from one of your deck lists ("Commander",
 * "Pauper cube", ...).
 *
 * Lists and decks live in localStorage and, for the owner, sync across devices
 * with the rest of their account data (lib/user-sync.ts): every list and deck
 * is an entry with its own edit time `t`, so the newer edit wins, and deleting
 * leaves a stamped "deleted" entry so deletions sync too.
 *
 * Decks saved before lists existed have no `list`; they belong to the
 * starting list (DEFAULT_LIST, "My decks").
 */
import { LOCAL_CHANGE_EVENT, REMOTE_CHANGE_EVENT } from "./user-sync";

export const DECKS_KEY = "booster-tutor-decks-v1";
export const LISTS_KEY = "booster-tutor-deck-lists-v1";
export const DEFAULT_LIST = "default";
const DEFAULT_LIST_NAME = "My decks";
export const MIN_SEATS = 2;
export const MAX_SEATS = 4;

export interface Deck {
  t: number;
  name: string;
  /** In the pool the dealer picks from (off: lent out, being rebuilt...). */
  active: boolean;
  /** The list it's in (missing = the starting list). */
  list?: string;
  deleted?: boolean;
}

export interface DeckList {
  t: number;
  name: string;
  deleted?: boolean;
}

export type DeckMap = Record<string, Deck>;
export type ListMap = Record<string, DeckList>;

function read<T>(key: string): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "{}") as T;
    return v && typeof v === "object" ? v : ({} as T);
  } catch {
    return {} as T;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked storage: it still works until the page closes.
  }
  window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
}

export const loadDecks = (): DeckMap => read<DeckMap>(DECKS_KEY);
export const saveDecks = (map: DeckMap): void => write(DECKS_KEY, map);
export const loadLists = (): ListMap => read<ListMap>(LISTS_KEY);
export const saveLists = (map: ListMap): void => write(LISTS_KEY, map);

/** Fires when another device's changes arrive. Returns the unsubscribe. */
export function onRemoteDecks(fn: () => void): () => void {
  window.addEventListener(REMOTE_CHANGE_EVENT, fn);
  return () => window.removeEventListener(REMOTE_CHANGE_EVENT, fn);
}

const norm = (name: string) => name.trim().replace(/\s+/g, " ");
const listOf = (d: Deck) => d.list ?? DEFAULT_LIST;

/**
 * The lists, A to Z. The starting list is always there unless it was
 * deleted on purpose (and is the only one when nothing's been made yet).
 */
export function listLists(lists: ListMap): (DeckList & { id: string })[] {
  const out = Object.entries(lists)
    .filter(([, l]) => l && !l.deleted && typeof l.name === "string")
    .map(([id, l]) => ({ ...l, id }));
  if (!lists[DEFAULT_LIST]) out.push({ id: DEFAULT_LIST, t: 0, name: DEFAULT_LIST_NAME });
  if (!out.length) out.push({ id: DEFAULT_LIST, t: 0, name: DEFAULT_LIST_NAME });
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** The decks in one list (not deleted), A to Z. */
export function listDecks(map: DeckMap, listId: string = DEFAULT_LIST): (Deck & { id: string })[] {
  return Object.entries(map)
    .filter(([, d]) => d && !d.deleted && typeof d.name === "string" && listOf(d) === listId)
    .map(([id, d]) => ({ ...d, id }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** A new list (a name already used, any capitalisation, isn't added). Returns its id, or null. */
export function addList(lists: ListMap, name: string, now: number, newId: () => string): { lists: ListMap; id: string | null } {
  const n = norm(name).slice(0, 60);
  if (!n || listLists(lists).some((l) => l.name.toLowerCase() === n.toLowerCase())) return { lists, id: null };
  const id = newId();
  return { lists: { ...lists, [id]: { t: now, name: n } }, id };
}

export function renameList(lists: ListMap, id: string, name: string, now: number): ListMap {
  const n = norm(name).slice(0, 60);
  const cur = listLists(lists).find((l) => l.id === id);
  if (!cur || !n || n === cur.name) return lists;
  return { ...lists, [id]: { t: now, name: n } };
}

/** Delete a list and the decks in it (stamped, so it syncs). */
export function deleteList(lists: ListMap, decks: DeckMap, id: string, now: number): { lists: ListMap; decks: DeckMap } {
  const cur = listLists(lists).find((l) => l.id === id);
  if (!cur) return { lists, decks };
  const nextDecks = { ...decks };
  for (const d of listDecks(decks, id)) nextDecks[d.id] = { ...decks[d.id], deleted: true, t: now };
  return { lists: { ...lists, [id]: { t: now, name: cur.name, deleted: true } }, decks: nextDecks };
}

/**
 * Add decks to a list, one per line (pasting a whole list works). Blank lines
 * and names already in that list (any capitalisation) are skipped.
 */
export function addDecks(
  map: DeckMap,
  text: string,
  now: number,
  newId: () => string,
  listId: string = DEFAULT_LIST,
): { map: DeckMap; added: number } {
  const have = new Set(listDecks(map, listId).map((d) => d.name.toLowerCase()));
  const next = { ...map };
  let added = 0;
  for (const line of text.split(/\r?\n/)) {
    const name = norm(line);
    if (!name || name.length > 80 || have.has(name.toLowerCase())) continue;
    have.add(name.toLowerCase());
    next[newId()] = { t: now, name, active: true, ...(listId !== DEFAULT_LIST && { list: listId }) };
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
