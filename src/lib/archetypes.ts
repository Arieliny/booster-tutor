/**
 * The cube's archetypes (docs/ARCHETYPES.md is the long version). Every card
 * carries tags like "lands:P": an archetype key and a role.
 *
 *   P payoff   the card the deck is built around
 *   E enabler  makes the payoff work
 *   F fits     a good card for the deck that doesn't define it
 *
 * The baked tags come from scripts/archetype-tags.json (the AI pass, corrected
 * by hand); a card's decision can override them.
 */

export type Role = "P" | "E" | "F";
export const ROLES: Role[] = ["P", "E", "F"];
export const ROLE_LABEL: Record<Role, string> = { P: "Payoff", E: "Enabler", F: "Fits" };

export interface Archetype {
  key: string;
  label: string;
  /** Short colour hint for the table. */
  colors: string;
}

export const ARCHETYPES: Archetype[] = [
  { key: "aggro", label: "Aggro", colors: "RW" },
  { key: "artifacts", label: "Artifacts", colors: "U/R/C" },
  { key: "reanimator", label: "Reanimator & cheat", colors: "B/R" },
  { key: "ramp", label: "RG ramp", colors: "RG" },
  { key: "control", label: "WU control", colors: "WU" },
  { key: "storm", label: "Storm", colors: "UBR" },
  { key: "goodstuff", label: "Good stuff", colors: "3–5c" },
  { key: "gw", label: "GW counters", colors: "GW" },
  { key: "lands", label: "Lands matter", colors: "Gx" },
  { key: "graveyard", label: "Graveyard", colors: "BR/BG" },
  { key: "tokens", label: "Tokens & sac", colors: "Wx/R" },
  { key: "spells", label: "Spells matter", colors: "UR/WU" },
  { key: "blink", label: "Blink / ETB", colors: "Wx" },
  { key: "tempo", label: "UB tempo", colors: "UB" },
  { key: "initiative", label: "Initiative", colors: "any" },
  { key: "wheels", label: "Wheels", colors: "UB/UR" },
];

export const archetypeOf = (key: string): Archetype | undefined => ARCHETYPES.find((a) => a.key === key);

/** "lands:P" -> { key: "lands", role: "P" }; anything malformed is dropped. */
export function parseTag(tag: string): { key: string; role: Role } | null {
  const [key, role] = tag.split(":");
  return archetypeOf(key) && ROLES.includes(role as Role) ? { key, role: role as Role } : null;
}

export const isTag = (tag: string): boolean => parseTag(tag) !== null;
