/**
 * Which trackers this device shows on the life counter (Settings on its
 * opening screen). Most tables never touch dungeons or day/night, so each
 * tracker's controls can be switched off. Hiding one only hides the controls:
 * anything already on the table (a crown, a dungeon room, commander damage
 * being tracked) still shows and can still be put away, since the game state
 * drives that.
 *
 * Kept per device in localStorage: guests aren't signed in, and the people
 * around one phone share its settings anyway.
 */

export type TrackerKey = "cmdr" | "monarch" | "dungeons" | "dayNight" | "ring" | "blessing" | "emblems" | "mana";

export const TRACKERS: { key: TrackerKey; label: string; hint: string }[] = [
  { key: "cmdr", label: "Commander damage", hint: "A strip on your card with the damage taken from each opponent" },
  { key: "monarch", label: "The monarch", hint: "A crown that passes around the table" },
  { key: "dungeons", label: "Dungeons and the initiative", hint: "The dungeon map; venturing into Undercity takes the initiative" },
  { key: "dayNight", label: "Day and night", hint: "Shown on the middle button, for the whole table" },
  { key: "ring", label: "The Ring", hint: "How far the Ring has tempted each player" },
  { key: "blessing", label: "The city's blessing", hint: "Ascend: ten or more permanents" },
  { key: "emblems", label: "Emblems", hint: "Planeswalker emblems, by name" },
  { key: "mana", label: "Unspent mana", hint: "Mana counters on your card, one per color" },
];

export interface LifeSettings {
  show: Record<TrackerKey, boolean>;
  /** The last custom starting life typed into New game. */
  customLife: number;
}

export const DEFAULT_SETTINGS: LifeSettings = {
  show: { cmdr: true, monarch: true, dungeons: true, dayNight: true, ring: true, blessing: true, emblems: true, mana: true },
  customLife: 30,
};

const KEY = "booster-tutor-life-settings-v1";

/** A saved settings object, with anything missing or malformed falling back to the default. */
export function parseSettings(raw: unknown): LifeSettings {
  const out: LifeSettings = { show: { ...DEFAULT_SETTINGS.show }, customLife: DEFAULT_SETTINGS.customLife };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as { show?: unknown; customLife?: unknown };
  if (r.show && typeof r.show === "object") {
    for (const t of TRACKERS) {
      const v = (r.show as Record<string, unknown>)[t.key];
      if (typeof v === "boolean") out.show[t.key] = v;
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
