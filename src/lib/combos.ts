/**
 * Combos: the two- and three-card interactions worth knowing when cutting
 * (src/data/combos.json, from docs/ARCHETYPES.md). A combo is a list of slots;
 * each slot is the cards that can fill it, so "Black Lotus or LED + Auriok
 * Salvagers" is two slots. It's complete when every slot has a card in the
 * cube after the current decisions.
 */
import raw from "../data/combos.json";
import { data, inMyCube, normalizeStatus, type Decisions } from "./cube-review";

interface ComboRaw {
  id: string;
  slots: string[][];
  result: string;
}

export interface ComboCard {
  name: string;
  /** Oracle ID when the card is in the data (it almost always is). */
  id?: string;
}

export interface Combo {
  id: string;
  slots: ComboCard[][];
  result: string;
}

const byName = new Map<string, string>();
for (const c of Object.values(data.cards)) {
  byName.set(c.name, c.id);
  if (c.name.includes(" // ")) byName.set(c.name.split(" // ")[0], c.id);
}

export const COMBOS: Combo[] = (raw as ComboRaw[]).map((c) => ({
  id: c.id,
  result: c.result,
  slots: c.slots.map((slot) => slot.map((name) => ({ name, id: byName.get(name) }))),
}));

/** Every combo this card is part of. */
export function combosFor(id: string): Combo[] {
  return COMBOS.filter((c) => c.slots.some((slot) => slot.some((x) => x.id === id)));
}

/** Whether a card is in the cube after the decisions: kept (not cut), or added. */
export function inCubeAfter(id: string | undefined, d: Decisions): boolean {
  if (!id) return false;
  const s = normalizeStatus(id, d[id]?.status);
  return inMyCube(id) ? s !== "cut" : s === "add";
}

export type ComboState = "complete" | "broken" | "incomplete";

/**
 * complete: every slot has a card in the cube after the decisions.
 * broken: it was complete with today's cube, and a cut takes a slot out.
 * incomplete: a slot was never filled (the piece isn't in the cube).
 */
export function comboState(c: Combo, d: Decisions): { state: ComboState; missing: ComboCard[][] } {
  const missing = c.slots.filter((slot) => !slot.some((x) => inCubeAfter(x.id, d)));
  if (!missing.length) return { state: "complete", missing };
  const wasComplete = c.slots.every((slot) => slot.some((x) => x.id && inMyCube(x.id)));
  return { state: wasComplete ? "broken" : "incomplete", missing };
}
