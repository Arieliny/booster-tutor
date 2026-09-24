/**
 * Set review data — a podcast set review turned into a searchable table.
 *
 * Card facts (name, cost, type, rules text, rarity) come from Scryfall so they
 * are authoritative; the grades and notes are extracted from the review itself.
 * Everything is baked into src/data/set-review-*.json at authoring time, so the
 * tab renders instantly with no network calls.
 */

import raw from "../data/set-review-fra.json";

export type Grade =
  | "A+" | "A" | "A-"
  | "B+" | "B" | "B-"
  | "C+" | "C" | "C-"
  | "D+" | "D" | "D-"
  | "F";

export type ReviewTag = "sideboard" | "build-around";

export interface SetReviewCard {
  name: string;
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text: string;
  power: string | null;
  toughness: string | null;
  colors: string[];
  color_identity: string[];
  rarity: string;
  set: string;
  collector_number: string;
  scryfall_id: string;
  image_url: string | null;
  /** Grades as given on the show; null when a host didn't commit to one. */
  marshall: Grade | null;
  luis: Grade | null;
  tag: ReviewTag | null;
  note: string | null;
}

export interface SetReview {
  set: string;
  setName: string;
  source: { title: string; url: string; reviewers: string[] };
  cards: SetReviewCard[];
}

export const setReview = raw as unknown as SetReview;

/** Best-to-worst. Index doubles as the sort key. */
export const GRADE_ORDER: Grade[] = [
  "A+", "A", "A-",
  "B+", "B", "B-",
  "C+", "C", "C-",
  "D+", "D", "D-",
  "F",
];

/** Higher is better; ungraded sorts last. */
export function gradeValue(g: Grade | null): number {
  if (!g) return -1;
  const i = GRADE_ORDER.indexOf(g);
  return i === -1 ? -1 : GRADE_ORDER.length - i;
}

/**
 * The grade we actually show. Luis is the primary reviewer; Marshall's grade is
 * only used when Luis didn't commit to one. Both are kept in the data so the
 * fallback can be labelled (and so nothing is lost if the rule changes).
 */
export interface PrimaryGrade {
  grade: Grade | null;
  source: "luis" | "marshall" | null;
}

export function primaryGrade(card: SetReviewCard): PrimaryGrade {
  if (card.luis) return { grade: card.luis, source: "luis" };
  if (card.marshall) return { grade: card.marshall, source: "marshall" };
  return { grade: null, source: null };
}

/** Sort key for the displayed grade; ungraded sorts last. */
export function primaryValue(card: SetReviewCard): number {
  return gradeValue(primaryGrade(card).grade);
}

/** Tailwind classes tinting a grade pill by letter. */
export function gradeTone(g: Grade | null): string {
  if (!g) return "bg-white/5 text-(--color-text-dim)";
  switch (g[0]) {
    case "A": return "bg-emerald-500/20 text-emerald-300";
    case "B": return "bg-sky-500/20 text-sky-300";
    case "C": return "bg-amber-500/20 text-amber-300";
    case "D": return "bg-orange-600/20 text-orange-300";
    default:  return "bg-red-600/20 text-red-300";
  }
}

export type ColorBucket = "W" | "U" | "B" | "R" | "G" | "M" | "C";

export const COLOR_BUCKETS: { id: ColorBucket; label: string }[] = [
  { id: "W", label: "White" },
  { id: "U", label: "Blue" },
  { id: "B", label: "Black" },
  { id: "R", label: "Red" },
  { id: "G", label: "Green" },
  { id: "M", label: "Multicolor" },
  { id: "C", label: "Colorless" },
];

export function colorBucket(card: SetReviewCard): ColorBucket {
  const colors = card.colors ?? [];
  if (colors.length === 0) return "C";
  if (colors.length > 1) return "M";
  return colors[0] as ColorBucket;
}

/** Split "{1}{W}{W}" into ["1","W","W"] for pip rendering. */
export function manaSymbols(cost: string): string[] {
  if (!cost) return [];
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}
