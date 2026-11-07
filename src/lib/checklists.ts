/**
 * Checklists: named card lists to tick off at the table (cards coming in from
 * an order, cards going out of the cube, a pasted list). Each one keeps its
 * own progress, so switching between them never loses any.
 *
 * Stored in localStorage as one stamped map (every entry carries its edit time
 * `t`), which the per-account sync (lib/user-sync.ts, api/userdata.ts) merges
 * entry by entry like the Cube review decisions:
 *   l:<listId>            the checklist: name, where its cards come from
 *   m:<listId>:<itemKey>  one card's mark on that checklist (0 none, 1 got it, 2 problem)
 * A deleted checklist stays as a stamped tombstone, so deleting syncs rather
 * than coming back from another device. Marks are per card, so ticking on the
 * phone and on the laptop at once both stick.
 *
 * Uploaded cubes' collection checklists (received / missing) are the older
 * per-cube inventory (lib/cube-store.ts), shown alongside these.
 */
import { LOCAL_CHANGE_EVENT } from "./user-sync";

export const CHECKLISTS_KEY = "booster-tutor-checklists-v1";

/** Cube review lists, which follow the decisions as they change. */
export type ReviewWhich = "add" | "cut" | "maybe" | "after" | "now";
export const REVIEW_SOURCES: { which: ReviewWhich; label: string; hint: string }[] = [
  { which: "add", label: "Coming in", hint: "Cards you've marked Add" },
  { which: "cut", label: "Going out", hint: "Cards you've marked Cut" },
  { which: "maybe", label: "Maybes", hint: "Cards you've marked Maybe" },
  { which: "after", label: "The cube after changes", hint: "Your cube with the adds in and the cuts out" },
  { which: "now", label: "The cube as it is", hint: "Your cube's current list" },
];

export type ChecklistSource = { kind: "review"; which: ReviewWhich } | { kind: "names"; names: string[] };

export interface Checklist {
  id: string;
  name: string;
  source: ChecklistSource;
  created: number;
}

/** 1 = got it, 2 = a problem (wrong printing, damaged, missing from the box). */
export type Mark = 1 | 2;

type Entry =
  | { t: number; name: string; source: ChecklistSource; created: number; deleted?: true }
  | { t: number; s: 0 | Mark };
type Store = Record<string, Entry>;

const MAX_NAMES = 1000;
const MAX_NAME_LENGTH = 40;

function read(): Store {
  try {
    const s = localStorage.getItem(CHECKLISTS_KEY);
    return s ? (JSON.parse(s) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store): boolean {
  try {
    localStorage.setItem(CHECKLISTS_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Edit times only move forward, so a quick second edit always wins the merge. */
let lastT = 0;
const stamp = () => (lastT = Math.max(Date.now(), lastT + 1));

const listKey = (id: string) => `l:${id}`;
const markKey = (id: string, item: string) => `m:${id}:${item}`;

/** Every checklist (oldest first) and each one's marks. */
export function loadChecklists(): { lists: Checklist[]; marks: Record<string, Record<string, Mark>> } {
  const store = read();
  const lists: Checklist[] = [];
  const marks: Record<string, Record<string, Mark>> = {};
  for (const [k, v] of Object.entries(store)) {
    if (k.startsWith("l:") && "name" in v && !v.deleted) lists.push({ id: k.slice(2), name: v.name, source: v.source, created: v.created });
  }
  const live = new Set(lists.map((l) => l.id));
  for (const [k, v] of Object.entries(store)) {
    if (!k.startsWith("m:") || !("s" in v) || !v.s) continue;
    const at = k.indexOf(":", 2);
    const id = k.slice(2, at);
    if (!live.has(id)) continue;
    (marks[id] ??= {})[k.slice(at + 1)] = v.s;
  }
  lists.sort((a, b) => a.created - b.created);
  return { lists, marks };
}

export function createChecklist(name: string, source: ChecklistSource): string {
  const id = Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);
  const t = stamp();
  const clean = cleanName(name) || "Checklist";
  const src: ChecklistSource = source.kind === "names" ? { kind: "names", names: source.names.slice(0, MAX_NAMES) } : source;
  write({ ...read(), [listKey(id)]: { t, name: clean, source: src, created: t } });
  return id;
}

export function renameChecklist(id: string, name: string): void {
  const store = read();
  const cur = store[listKey(id)];
  const clean = cleanName(name);
  if (!cur || !("name" in cur) || !clean || clean === cur.name) return;
  write({ ...store, [listKey(id)]: { ...cur, name: clean, t: stamp() } });
}

/** Delete a checklist (a stamped tombstone, so it stays deleted on every device). */
export function deleteChecklist(id: string): void {
  const store = read();
  const cur = store[listKey(id)];
  if (!cur || !("name" in cur)) return;
  write({ ...store, [listKey(id)]: { ...cur, deleted: true, t: stamp() } });
}

/** Set one card's mark on a checklist (0 clears it). */
export function setMark(id: string, item: string, mark: 0 | Mark): void {
  const store = read();
  const cur = store[markKey(id, item)];
  if ((cur && "s" in cur ? cur.s : 0) === mark) return;
  write({ ...store, [markKey(id, item)]: { t: stamp(), s: mark } });
}

/** Clear every mark on a checklist, so it can be ticked again from the start. */
export function resetChecklist(id: string): void {
  const store = read();
  const t = stamp();
  let changed = false;
  for (const [k, v] of Object.entries(store)) {
    if (k.startsWith(`m:${id}:`) && "s" in v && v.s) {
      store[k] = { t, s: 0 };
      changed = true;
    }
  }
  if (changed) write(store);
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * A card name as a mark key: its front face ("Fire // Ice" is "fire"), lowercase, no accents or
 * punctuation, short enough for the sync's key limit.
 */
export function nameKey(name: string): string {
  const k = name
    .split("//")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (k.length <= 48) return k;
  // Rare: very long names keep their start plus a short hash of the rest.
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0;
  return `${k.slice(0, 40)}#${(h >>> 0).toString(36)}`;
}

/**
 * Card names from pasted text, one per line, in order, each once. Takes the
 * usual list formats: "2 Lightning Bolt", "2x Lightning Bolt", a set code and
 * collector number after the name ("Bolt (LEA) 161"), Moxfield's "*F*", and
 * section headers or blank lines (skipped).
 */
export function parseNames(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || /^(\/\/|#)/.test(line)) continue;
    // Section headers: "Sideboard", "Creatures (12)", "Deck:".
    if (/^[A-Za-z ]+(\(\d+\))?:?$/.test(line) && /^(deck|sideboard|commander|companion|maybeboard|creatures?|instants?|sorcery|sorceries|artifacts?|enchantments?|lands?|planeswalkers?|other)\b/i.test(line)) continue;
    line = line.replace(/^\d+\s*x?\s+/i, "");
    line = line.replace(/\s+\*[A-Z]+\*\s*$/, "");
    line = line.replace(/\s+\([A-Za-z0-9]{2,6}\)(\s+\S+)?\s*$/, "");
    line = line.trim();
    if (!line) continue;
    const k = nameKey(line);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(line);
  }
  return out;
}
