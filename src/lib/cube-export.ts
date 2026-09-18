/**
 * Cube export to plain-text lists.
 *
 * Two flavours, both plain `.txt`:
 *   - toCubeList():    one card per line, Draftmancer / MTGO / Cockatrice
 *                      syntax `1 Name (SET) 123`. Also round-trips through our
 *                      own paste/upload importer.
 *   - toPancakeFile(): the same list wrapped in Draftmancer's custom card list
 *                      format, with a [Settings] block that configures a
 *                      two-player Pancake draft.
 *
 * Pancake draft (Joost Vunderink, 2013) is a 2-player pick-and-burn cube
 * format: 11-card packs, and for each pack the holder picks 1, passes, the
 * opponent picks 2 and burns 2, passes back, and the opener picks 2 and burns
 * the last 4. Five cards drafted and six destroyed per pack.
 *
 * Draftmancer has no built-in Pancake mode, but its `boosterSettings` takes a
 * sequence of pick/burn phases per booster, and with two players a pack changes
 * hands after every phase — which is exactly Pancake's swap. So the format
 * falls out of picks [1,2,2] / burns [0,2,4] (5 + 6 = an 11-card pack).
 * See https://draftmancer.com/cubeformat.html
 */

import type { Cube, CubeCard } from "../types";

export const PANCAKE_PACK_SIZE = 11;
export const PANCAKE_PICKS = [1, 2, 2];
export const PANCAKE_BURNS = [0, 2, 4];
export const PANCAKE_PLAYERS = 2;
/** The canonical format is 18 packs (9 per player) = 198 cards. */
export const PANCAKE_BOOSTERS_PER_PLAYER = 9;

/** Deck-list tools want the front face of a double-faced card. */
function frontFaceName(name: string): string {
  const i = name.indexOf(" // ");
  return i === -1 ? name : name.slice(0, i);
}

/** `1 Name (SET) 123`, falling back to the bare name when we lack a printing. */
function cardLine(card: CubeCard): string {
  const name = frontFaceName(card.name);
  const set = card.set ? card.set.toUpperCase() : "";
  if (set && card.collector_number) {
    return `1 ${name} (${set}) ${card.collector_number}`;
  }
  return `1 ${name}`;
}

/** Plain one-card-per-line list. */
export function toCubeList(cube: Cube): string {
  return cube.cards.map(cardLine).join("\n") + "\n";
}

/**
 * How many packs each player opens. Canonically 9, but clamp so we never ask
 * Draftmancer for more cards than the cube actually holds.
 */
export function pancakeBoostersPerPlayer(cardCount: number): number {
  const fits = Math.floor(cardCount / (PANCAKE_PLAYERS * PANCAKE_PACK_SIZE));
  return Math.max(1, Math.min(PANCAKE_BOOSTERS_PER_PLAYER, fits));
}

/** Cards consumed by a pancake draft of this size. */
export function pancakeCardsUsed(boostersPerPlayer: number): number {
  return boostersPerPlayer * PANCAKE_PLAYERS * PANCAKE_PACK_SIZE;
}

/** Draftmancer custom card list preconfigured for a 2-player pancake draft. */
export function toPancakeFile(cube: Cube): string {
  const boostersPerPlayer = pancakeBoostersPerPlayer(cube.cards.length);
  const settings = {
    name: `${cube.name} — Pancake draft (2 players)`,
    boostersPerPlayer,
    withReplacement: false,
    // One entry per booster: pick 1 / pick 2 burn 2 / pick 2 burn 4.
    boosterSettings: Array.from({ length: boostersPerPlayer }, () => ({
      picks: PANCAKE_PICKS,
      burns: PANCAKE_BURNS,
    })),
  };

  return [
    "[Settings]",
    JSON.stringify(settings, null, 2),
    `[Pancake(${PANCAKE_PACK_SIZE})]`,
    ...cube.cards.map(cardLine),
    "",
  ].join("\n");
}

/** Slug a cube name into something safe for a download filename. */
export function safeFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || "cube";
}

/** Trigger a browser download of a text file. */
export function downloadText(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
