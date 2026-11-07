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

/** What a pasted or imported line said about the copy you're expecting. */
export interface CardDetail {
  qty?: number;
  /** The printing: set and collector number, frame, foil ("The Hobbit #117", "Retro Frame, Modern Horizons 2 #404"). */
  printing?: string;
  /** NM, LP, PL... */
  condition?: string;
  /** Where it's coming from: a store, a proxy order, a friend. */
  from?: string;
}

export type ChecklistSource =
  | { kind: "review"; which: ReviewWhich }
  /** `details` by nameKey, for lines that said more than the name. */
  | { kind: "names"; names: string[]; details?: Record<string, CardDetail> };

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
  let src: ChecklistSource = source;
  if (source.kind === "names") {
    const names = source.names.slice(0, MAX_NAMES);
    const keep = new Set(names.map(nameKey));
    const details = Object.fromEntries(Object.entries(source.details ?? {}).filter(([k]) => keep.has(k)));
    src = { kind: "names", names, ...(Object.keys(details).length && { details }) };
  }
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
    .replace(/[\u0300-\u036f]/g, "")
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

/** One line of a pasted or imported list. `group` is the cube it's for, when the file says (the order CSV does). */
export interface ListRow extends CardDetail {
  name: string;
  group?: string;
}

/**
 * The cards in pasted text or an opened file, one row per line, in order.
 * Knows the CubeOrdering files as well as plain lists:
 *  - the card-by-card order CSV (a header row naming Card, and maybe Cube, Qty,
 *    Source, Printing, Condition),
 *  - a store cart snapshot ("qty|Name [num] [Set]|condition|price|..."),
 *  - an MPC proxy order (the XML; a card's slots are its copies),
 *  - plain lists: "2 Lightning Bolt", "2x ...", a set code and collector number
 *    after the name ("Bolt (LEA) 161"), Moxfield's "*F*", section headers.
 */
export function parseList(text: string): ListRow[] {
  if (/<order>[\s\S]*<fronts>/.test(text)) return parseMpc(text);
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = csvFields(lines.find((l) => l.trim()) ?? "").map((h) => h.trim().toLowerCase());
  if (header.length > 2 && header.some((h) => h === "card" || h === "name")) return parseCsv(lines, header);
  const rows: ListRow[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^(\/\/|#)/.test(line)) continue;
    const row = line.split("|").length >= 3 && /^\d+\|/.test(line) ? cartRow(line) : plainRow(line);
    if (row) rows.push(row);
  }
  return rows;
}

/** The rows as a checklist: each card once, in order, with what its lines said put together. */
export function mergeRows(rows: ListRow[]): { names: string[]; details: Record<string, CardDetail> } {
  const names: string[] = [];
  const details: Record<string, CardDetail> = {};
  const join = (a: string | undefined, b: string | undefined, sep: string) =>
    !a ? b : !b || a.split(sep).includes(b) ? a : `${a}${sep}${b}`;
  for (const r of rows) {
    const k = nameKey(r.name);
    if (!k) continue;
    const d = details[k];
    if (!d) {
      names.push(r.name);
      details[k] = { qty: r.qty ?? 1, ...(r.printing && { printing: r.printing }), ...(r.condition && { condition: r.condition }), ...(r.from && { from: r.from }) };
      continue;
    }
    d.qty = (d.qty ?? 1) + (r.qty ?? 1);
    d.printing = join(d.printing, r.printing, " + ");
    d.condition = join(d.condition, r.condition, "/");
    d.from = join(d.from, r.from, " + ");
  }
  // A single copy is the default: don't store it.
  for (const d of Object.values(details)) if (d.qty === 1) delete d.qty;
  for (const k of Object.keys(details)) if (!Object.keys(details[k]).length) delete details[k];
  return { names, details };
}

/** Card names from pasted text, each once, in order (see parseList for the formats). */
export function parseNames(text: string): string[] {
  return mergeRows(parseList(text)).names;
}

const SECTION = /^(deck|sideboard|commander|companion|maybeboard|creatures?|instants?|sorcery|sorceries|artifacts?|enchantments?|lands?|planeswalkers?|other)\b/i;

function plainRow(line: string): ListRow | null {
  // Section headers: "Sideboard", "Creatures (12)", "Deck:".
  if (/^[A-Za-z ]+(\(\d+\))?:?$/.test(line) && SECTION.test(line)) return null;
  let rest = line;
  let qty: number | undefined;
  const q = rest.match(/^(\d+)\s*x?\s+/i);
  if (q) {
    qty = Number(q[1]);
    rest = rest.slice(q[0].length);
  }
  let foil = false;
  const f = rest.match(/\s+\*([A-Z]+)\*\s*$/);
  if (f) {
    foil = f[1] === "F" || f[1] === "E";
    rest = rest.slice(0, f.index);
  }
  let printing: string | undefined;
  const s = rest.match(/\s+\(([A-Za-z0-9]{2,6})\)(?:\s+(\S+))?\s*$/);
  if (s) {
    printing = s[1].toUpperCase() + (s[2] ? ` #${s[2]}` : "");
    rest = rest.slice(0, s.index);
  }
  if (foil) printing = printing ? `${printing}, foil` : "Foil";
  const name = rest.trim();
  return name ? { name, ...(qty && { qty }), ...(printing && { printing }) } : null;
}

/** "1|Basking Rootwalla [121] [Torment]|PL|0.79|5173..." or Topdeck Hero's "1|Young Blue Dragon // Sand Augury [Set]|Hero Deal|...". */
function cartRow(line: string): ListRow | null {
  const [qty, title, condition] = line.split("|");
  const at = title.indexOf(" [");
  const name = (at < 0 ? title : title.slice(0, at)).trim();
  if (!name) return null;
  const tags = [...title.slice(Math.max(at, 0)).matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
  const num = tags.find((t) => /^\d+[a-z]?$/i.test(t));
  const rest = tags.filter((t) => t !== num);
  const printing = [rest.join(", "), num ? `#${num}` : ""].filter(Boolean).join(" ");
  const cond = condition?.trim();
  return {
    name,
    ...(Number(qty) > 0 && { qty: Number(qty) }),
    ...(printing && { printing }),
    // Topdeck Hero writes its price tier where the condition goes.
    ...(cond && /^(NM|LP|MP|HP|PL|DMG|EX|VG|GD|near mint|lightly played|played|moderately played|heavily played)$/i.test(cond) && { condition: cond }),
  };
}

function parseCsv(lines: string[], header: string[]): ListRow[] {
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const at = {
    name: col("card", "name"),
    qty: col("qty", "quantity", "count"),
    from: col("source", "store", "from"),
    printing: col("printing", "edition", "set"),
    condition: col("condition"),
    group: col("cube"),
  };
  const rows: ListRow[] = [];
  let first = true;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (first) {
      first = false; // the header
      continue;
    }
    const f = csvFields(line).map((x) => x.trim());
    const get = (i: number) => (i >= 0 ? f[i] || undefined : undefined);
    const name = get(at.name);
    if (!name) continue;
    const qty = Number(get(at.qty));
    rows.push({
      name,
      ...(qty > 0 && { qty }),
      ...(get(at.printing) && { printing: get(at.printing) }),
      ...(get(at.condition) && { condition: get(at.condition) }),
      // "Face to Face (in cart)" is just Face to Face once it's ordered.
      ...(get(at.from) && { from: get(at.from)!.replace(/\s*\(in cart\)$/i, "") }),
      ...(get(at.group) && { group: get(at.group) }),
    });
  }
  return rows;
}

/** One CSV line's fields (quoted fields may hold commas and "" for a quote). */
function csvFields(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** An MPC Autofill order: the fronts only (the back is the card back), copies = slots. */
function parseMpc(xml: string): ListRow[] {
  const fronts = xml.match(/<fronts>([\s\S]*?)<\/fronts>/)?.[1] ?? "";
  const rows: ListRow[] = [];
  for (const m of fronts.matchAll(/<card>([\s\S]*?)<\/card>/g)) {
    const file = m[1].match(/<name>([^<]*)<\/name>/)?.[1] ?? "";
    const slots = (m[1].match(/<slots>([^<]*)<\/slots>/)?.[1] ?? "").split(",").filter((s) => s.trim()).length;
    // "Bazaar of Baghdad.png", sometimes "Name (Artist).jpg".
    const name = decodeXml(file.replace(/\.[a-z0-9]+$/i, "").replace(/\s*\([^)]*\)\s*$/, "")).trim();
    if (name) rows.push({ name, ...(slots > 1 && { qty: slots }), from: "MPC proxy" });
  }
  return rows;
}

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
