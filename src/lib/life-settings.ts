/**
 * Which trackers this device shows on the life counter (Settings on its
 * opening screen). Most tables never touch dungeons or day/night, so each
 * tracker's controls can be switched off. Hiding one only hides the controls:
 * anything already on the table (a crown, a dungeon room, commander damage
 * being tracked) still shows and can still be put away, since the game state
 * drives that.
 *
 * The same goes for the player counters a life card offers (poison, energy,
 * tickets...): switched off, a counter leaves each player's menu, but one
 * already on a card stays until it's removed.
 *
 * Kept per device in localStorage: guests aren't signed in, and the people
 * around one phone share its settings anyway.
 */
import { COUNTERS, type CounterKey } from "./life";

/** The counters Settings can switch off: all but unspent mana, which is a tracker of its own. */
export const CARD_COUNTERS = COUNTERS.filter((c) => !c.pip);
/** The ones most tables use (Ari, 2026-11-03); experience, rad, speed and tickets start switched off. */
const COUNTERS_ON: CounterKey[] = ["poison", "energy", "tax", "storm"];

export type TrackerKey = "cmdr" | "monarch" | "dungeons" | "dayNight" | "ring" | "blessing" | "story" | "emblems" | "mana";

export const TRACKERS: { key: TrackerKey; label: string; hint: string }[] = [
  { key: "cmdr", label: "Commander damage", hint: "A strip on your card with the damage taken from each opponent" },
  { key: "monarch", label: "The monarch", hint: "A crown that passes around the table" },
  { key: "dungeons", label: "Dungeons and the initiative", hint: "The dungeon map; venturing into Undercity takes the initiative" },
  { key: "dayNight", label: "Day and night", hint: "Shown on the middle button, for the whole table" },
  { key: "ring", label: "The Ring", hint: "How far the Ring has tempted each player" },
  { key: "blessing", label: "The city's blessing", hint: "Ascend: ten or more permanents" },
  { key: "story", label: "The Enduring Story", hint: "Storied: three permanents that are artifacts, Sagas or legendary" },
  { key: "emblems", label: "Emblems", hint: "Planeswalker emblems, by name" },
  { key: "mana", label: "Unspent mana", hint: "Mana counters on your card, one per color" },
];

export interface LifeSettings {
  show: Record<TrackerKey, boolean>;
  /** Which counters each player's menu offers (keys of CARD_COUNTERS). */
  cardCounters: Partial<Record<CounterKey, boolean>>;
  /** The last custom starting life typed into New game. */
  customLife: number;
}

export const DEFAULT_SETTINGS: LifeSettings = {
  show: { cmdr: true, monarch: true, dungeons: true, dayNight: true, ring: true, blessing: true, story: true, emblems: true, mana: true },
  cardCounters: Object.fromEntries(CARD_COUNTERS.map((c) => [c.key, COUNTERS_ON.includes(c.key)])),
  customLife: 30,
};

const KEY = "booster-tutor-life-settings-v1";

/** A saved settings object, with anything missing or malformed falling back to the default. */
export function parseSettings(raw: unknown): LifeSettings {
  const out: LifeSettings = { show: { ...DEFAULT_SETTINGS.show }, cardCounters: { ...DEFAULT_SETTINGS.cardCounters }, customLife: DEFAULT_SETTINGS.customLife };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as { show?: unknown; cardCounters?: unknown; customLife?: unknown };
  if (r.show && typeof r.show === "object") {
    for (const t of TRACKERS) {
      const v = (r.show as Record<string, unknown>)[t.key];
      if (typeof v === "boolean") out.show[t.key] = v;
    }
  }
  if (r.cardCounters && typeof r.cardCounters === "object") {
    for (const c of CARD_COUNTERS) {
      const v = (r.cardCounters as Record<string, unknown>)[c.key];
      if (typeof v === "boolean") out.cardCounters[c.key] = v;
    }
  }
  if (typeof r.customLife === "number" && Number.isInteger(r.customLife) && r.customLife >= 1 && r.customLife <= 999) {
    out.customLife = r.customLife;
  }
  return out;
}

export function loadSettings(): LifeSettings {
  try {
    return parseSettings(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return parseSettings(null);
  }
}

export function saveSettings(s: LifeSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Blocked storage: the settings hold until the page closes.
  }
}
