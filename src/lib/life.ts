/**
 * The life counter's game state: pure functions, no React, so it's testable.
 *
 * Every change returns a new Game and records a history entry holding the
 * affected players as they were BEFORE the change, so undo is just "put them
 * back". Quick repeated taps on the same thing merge into one entry (−3, not
 * −1 −1 −1), and undo takes back the whole merged change.
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const STARTING_LIFE = [20, 25, 30, 40];
/** Taps on the same thing this close together become one history entry. */
export const MERGE_MS = 4000;
const MAX_HISTORY = 200;

export type CounterKey = "poison" | "energy" | "experience" | "rad" | "tax";
export const COUNTERS: { key: CounterKey; label: string; step?: number; lethal?: number }[] = [
  { key: "poison", label: "Poison", lethal: 10 },
  { key: "energy", label: "Energy" },
  { key: "experience", label: "Experience" },
  { key: "rad", label: "Rad" },
  // Each cast of the commander costs 2 more.
  { key: "tax", label: "Commander tax", step: 2 },
];

export type MarkerKey = "monarch" | "initiative";
export const MARKERS: { key: MarkerKey; label: string }[] = [
  { key: "monarch", label: "Monarch" },
  { key: "initiative", label: "Initiative" },
];

export type ColorKey = "white" | "blue" | "black" | "red" | "green" | "gold" | "gray";
export const COLORS: { key: ColorKey; label: string; hex: string }[] = [
  { key: "white", label: "White", hex: "#d8cfa8" },
  { key: "blue", label: "Blue", hex: "#3b78d8" },
  { key: "black", label: "Black", hex: "#7a5e9a" },
  { key: "red", label: "Red", hex: "#d84a4a" },
  { key: "green", label: "Green", hex: "#33a15f" },
  { key: "gold", label: "Gold", hex: "#c9a227" },
  { key: "gray", label: "Gray", hex: "#6b7280" },
];
export const colorHex = (c: ColorKey) => COLORS.find((x) => x.key === c)?.hex ?? "#6b7280";
/** Seat colors for a new game, in seat order. */
const SEAT_COLORS: ColorKey[] = ["blue", "red", "green", "black", "white", "gold"];

export interface Player {
  life: number;
  color: ColorKey;
  /** Only counters that have been added to this player appear here. */
  counters: Partial<Record<CounterKey, number>>;
  /** Commander damage taken, by the seat it came from. */
  cmdr: Partial<Record<number, number>>;
}

export type EntryKind = "life" | "set" | "counter" | "cmdr" | "marker" | "color";

export interface Entry {
  t: number;
  /** The player it happened to. */
  p: number;
  kind: EntryKind;
  key?: CounterKey | MarkerKey;
  /** Commander damage: the seat it came from. */
  from?: number;
  /** Net change (life, counter or commander damage); for "set", the new life. */
  d: number;
  /** The players this changed, as they were before it. */
  before: { i: number; player: Player }[];
  markersBefore?: Partial<Record<MarkerKey, number>>;
}

export interface Game {
  v: 2;
  start: number;
  players: Player[];
  /** Who holds each table-wide marker, by seat. */
  markers: Partial<Record<MarkerKey, number>>;
  history: Entry[];
}

export function newGame(count: number, start: number, previous?: Game): Game {
  const n = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(count)));
  return {
    v: 2,
    start,
    // Seats keep the colors they had last game.
    players: Array.from({ length: n }, (_, i) => ({
      life: start,
      color: previous?.players[i]?.color ?? SEAT_COLORS[i],
      counters: {},
      cmdr: {},
    })),
    markers: {},
    history: [],
  };
}

/** True when nothing has happened yet this game (safe to replace without asking). */
export function untouched(g: Game): boolean {
  return g.history.every((e) => e.kind === "color");
}

const clone = (p: Player): Player => ({ ...p, counters: { ...p.counters }, cmdr: { ...p.cmdr } });

/** Apply a change to some players, recording (or merging into) a history entry. */
function record(
  g: Game,
  entry: Omit<Entry, "before" | "markersBefore" | "t">,
  touched: number[],
  change: (players: Player[], markers: Partial<Record<MarkerKey, number>>) => void,
  now: number,
  mergeable: boolean,
): Game {
  const players = g.players.map(clone);
  const markers = { ...g.markers };
  change(players, markers);

  const last = g.history[g.history.length - 1];
  const merge =
    mergeable &&
    last &&
    now - last.t <= MERGE_MS &&
    last.p === entry.p &&
    last.kind === entry.kind &&
    last.key === entry.key &&
    last.from === entry.from;
  const history = merge
    ? [...g.history.slice(0, -1), { ...last, t: now, d: last.d + entry.d }]
    : [
        ...g.history,
        {
          ...entry,
          t: now,
          before: touched.map((i) => ({ i, player: clone(g.players[i]) })),
          ...(entry.kind === "marker" && { markersBefore: { ...g.markers } }),
        },
      ].slice(-MAX_HISTORY);
  return { ...g, players, markers, history };
}

export function changeLife(g: Game, p: number, by: number, now = Date.now()): Game {
  if (!by) return g;
  return record(g, { p, kind: "life", d: by }, [p], (ps) => void (ps[p].life += by), now, true);
}

/** "Your life total becomes N." */
export function setLife(g: Game, p: number, life: number, now = Date.now()): Game {
  if (!Number.isFinite(life) || life === g.players[p].life) return g;
  const v = Math.round(life);
  return record(g, { p, kind: "set", d: v }, [p], (ps) => void (ps[p].life = v), now, false);
}

/** Show a counter on a player (at 0) without changing anything else. */
export function addCounter(g: Game, p: number, key: CounterKey): Game {
  if (g.players[p].counters[key] !== undefined) return g;
  const players = g.players.map((pl, i) => (i === p ? { ...pl, counters: { ...pl.counters, [key]: 0 } } : pl));
  return { ...g, players };
}

export function removeCounter(g: Game, p: number, key: CounterKey): Game {
  const players = g.players.map((pl, i) => {
    if (i !== p) return pl;
    const counters = { ...pl.counters };
    delete counters[key];
    return { ...pl, counters };
  });
  return { ...g, players };
}

export function changeCounter(g: Game, p: number, key: CounterKey, by: number, now = Date.now()): Game {
  const cur = g.players[p].counters[key] ?? 0;
  const by2 = Math.max(-cur, by); // counters don't go below 0
  if (!by2) return g;
  return record(g, { p, kind: "counter", key, d: by2 }, [p], (ps) => void (ps[p].counters[key] = cur + by2), now, true);
}

/** Commander damage to p from seat `from`. It's also life lost. */
export function changeCmdr(g: Game, p: number, from: number, by: number, now = Date.now()): Game {
  const cur = g.players[p].cmdr[from] ?? 0;
  const by2 = Math.max(-cur, by);
  if (!by2) return g;
  return record(
    g,
    { p, kind: "cmdr", from, d: by2 },
    [p],
    (ps) => {
      ps[p].cmdr[from] = cur + by2;
      ps[p].life -= by2;
    },
    now,
    true,
  );
}

/** Give a table-wide marker to p, or take it back if p already has it. */
export function toggleMarker(g: Game, p: number, key: MarkerKey, now = Date.now()): Game {
  const holds = g.markers[key] === p;
  return record(
    g,
    { p, kind: "marker", key, d: holds ? -1 : 1 },
    [],
    (_, m) => {
      if (holds) delete m[key];
      else m[key] = p;
    },
    now,
    false,
  );
}

export function setColor(g: Game, p: number, color: ColorKey): Game {
  // Not a game action: no history entry, and undo never changes colors back.
  return { ...g, players: g.players.map((pl, i) => (i === p ? { ...pl, color } : pl)) };
}

/** Take back the last change (a merged run of taps comes back as one). */
export function undo(g: Game): Game {
  const last = g.history[g.history.length - 1];
  if (!last) return g;
  const players = g.players.map(clone);
  // Put back only what this entry changed (a counter added since stays shown).
  const was = last.before.find((b) => b.i === last.p)?.player;
  const p = players[last.p];
  if (was) {
    if (last.kind === "life" || last.kind === "set") p.life = was.life;
    if (last.kind === "counter" && last.key) p.counters[last.key as CounterKey] = was.counters[last.key as CounterKey] ?? 0;
    if (last.kind === "cmdr" && last.from !== undefined) {
      p.cmdr[last.from] = was.cmdr[last.from] ?? 0;
      p.life = was.life;
    }
  }
  return {
    ...g,
    players,
    markers: last.markersBefore ? { ...last.markersBefore } : g.markers,
    history: g.history.slice(0, -1),
  };
}

/** Life after the entry, for the history list. */
export function lifeAfter(g: Game, index: number): number {
  const e = g.history[index];
  const next = g.history.slice(index + 1).find((x) => x.before.some((b) => b.i === e.p));
  return next ? next.before.find((b) => b.i === e.p)!.player.life : g.players[e.p].life;
}

export function rollDice(count: number, sides: number, random = Math.random): number[] {
  return Array.from({ length: count }, () => 1 + Math.floor(random() * sides));
}

/** A saved game, or null if it isn't one we can read (old versions are upgraded). */
export function parseGame(raw: unknown): Game | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  // Version 1: two players, { start, life: [you, opponent] }.
  if (g.v === undefined && Array.isArray(g.life) && g.life.length === 2 && typeof g.start === "number") {
    const out = newGame(2, g.start);
    out.players[0].life = Number(g.life[0]);
    out.players[1].life = Number(g.life[1]);
    return out;
  }
  if (g.v !== 2 || !Array.isArray(g.players) || g.players.length < MIN_PLAYERS || g.players.length > MAX_PLAYERS) return null;
  return g as unknown as Game;
}
