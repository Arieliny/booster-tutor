import { EMBLEMS } from "./emblems-data";

export { EMBLEMS };

/** The Ring's abilities, gained top to bottom as the Ring tempts you (Oracle text, LTR). */
export const RING_ABILITIES = [
  "Your Ring-bearer is legendary and can't be blocked by creatures with greater power.",
  "Whenever your Ring-bearer attacks, draw a card, then discard a card.",
  "Whenever your Ring-bearer becomes blocked by a creature, that creature's controller sacrifices it at end of combat.",
  "Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life.",
];

export const emblemText = (name: string): string => EMBLEMS.find((e) => e.name === name)?.text ?? "";

/**
 * What the emblem chips on a life card say: each emblem by its planeswalker ("Elspeth emblem", with "×2"
 * for a second copy), up to two chips; with three or more different ones the rest fold into "+N more".
 */
export function emblemChips(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  const labels = [...counts].map(([n, k]) => `${n.split(",")[0]} emblem${k > 1 ? ` ×${k}` : ""}`);
  if (labels.length <= 2) return labels;
  const [, firstCount] = [...counts][0];
  return [labels[0], `+${names.length - firstCount} more`];
}

/** Emblems whose name or text has every word typed (any order, any case). */
export function searchEmblems(q: string): { name: string; text: string }[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return EMBLEMS;
  return EMBLEMS.filter((e) => {
    const hay = `${e.name} ${e.text}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  }).sort((a, b) => Number(!words.every((w) => a.name.toLowerCase().includes(w))) - Number(!words.every((w) => b.name.toLowerCase().includes(w))));
}
