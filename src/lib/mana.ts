/** Mana symbol artwork + helpers shared by the set review and cube review. */
import manaSymbolUris from "../data/mana-symbols.json";

/**
 * Official Scryfall symbol artwork, inlined at build time by
 * scripts/build-mana-symbols.mjs so it works offline.
 */
export const SYMBOL_URI = manaSymbolUris as Record<string, string>;

/** Fallback faces for anything without baked artwork (and the filter buttons). */
export const PIP_STYLE: Record<string, string> = {
  W: "bg-[#f8f4e4] text-black",
  U: "bg-[#9fd5f2] text-black",
  B: "bg-[#b0a7a3] text-black",
  R: "bg-[#f4a08a] text-black",
  G: "bg-[#9ad3ae] text-black",
  // No real symbol exists for "multicolour" — gold is the convention.
  M: "bg-gradient-to-br from-[#e9d585] to-[#c1971f] text-black",
  C: "bg-[#cfc9c2] text-black",
};

/** Split "{1}{W}{W}" into ["1","W","W"] for pip rendering. */
export function manaSymbols(cost: string): string[] {
  if (!cost) return [];
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}
