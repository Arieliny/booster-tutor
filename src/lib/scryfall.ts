/**
 * Looking cards up on Scryfall (online only). Kept apart from cube-review.ts so
 * screens that only search for cards (the life counter's card search) don't
 * load the cube review data with them.
 */
import type { ReviewCard } from "./cube-review";

export const SCRYFALL = "https://api.scryfall.com";

/** Card-name suggestions as you type. */
export async function scryfallSuggest(q: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${SCRYFALL}/cards/autocomplete?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`Scryfall returned ${res.status}`);
  const j = (await res.json()) as { data?: string[] };
  return j.data ?? [];
}

/** One card by exact name, in the same shape as the baked data, with its oldest art. */
export async function scryfallCard(name: string): Promise<ReviewCard> {
  const res = await fetch(`${SCRYFALL}/cards/named?exact=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Scryfall couldn't find "${name}"`);
  const c = fromScryfall(await res.json());
  return withOldestArt(c);
}

export interface ScryPrinting {
  id: string;
  digital?: boolean;
  promo?: boolean;
  variation?: boolean;
  oversized?: boolean;
  set_type?: string;
  layout?: string;
  image_uris?: unknown;
  card_faces?: { image_uris?: unknown }[];
}

/**
 * Swap in the card's oldest regular paper printing (same rules as
 * scripts/lib/oldest-printings.mjs). Best effort: on any failure the card keeps
 * Scryfall's default printing.
 */
async function withOldestArt(c: ReviewCard): Promise<ReviewCard> {
  try {
    const q = `oracleid:${c.id} game:paper -is:promo -is:oversized`;
    const res = await fetch(`${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=released&dir=asc`);
    if (!res.ok) return c;
    const { data } = (await res.json()) as { data?: ScryPrinting[] };
    const p = (data ?? []).find(
      (x) =>
        !x.digital &&
        !x.variation &&
        x.set_type !== "memorabilia" &&
        x.layout !== "art_series" &&
        (x.image_uris || x.card_faces?.[0]?.image_uris),
    );
    if (!p || p.id === c.sid) return c;
    return {
      ...c,
      img: `https://cards.scryfall.io/small/front/${p.id[0]}/${p.id[1]}/${p.id}.jpg`,
      back: !p.image_uris && !!p.card_faces?.[1]?.image_uris ? true : undefined,
    };
  } catch {
    return c;
  }
}

interface ScryFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors?: string[];
  oracle_id?: string;
  image_uris?: { small?: string };
}
interface ScryCard extends ScryFace {
  id: string;
  cmc?: number;
  color_identity: string[];
  rarity: string;
  layout: string;
  card_faces?: ScryFace[];
}

/** Mirrors normalize() in scripts/build-cube-review.mjs. */
export function fromScryfall(c: ScryCard): ReviewCard {
  const faces = c.card_faces;
  const frontImg = c.image_uris ?? faces?.[0]?.image_uris;
  const pt = (x: ScryFace) => (x.power != null ? `${x.power}/${x.toughness}` : undefined);
  return {
    id: c.oracle_id ?? faces?.[0]?.oracle_id ?? c.id,
    sid: c.id,
    name: c.name,
    cost: c.mana_cost ?? (faces ?? []).map((f) => f.mana_cost ?? "").join(" // "),
    cmc: c.cmc ?? 0,
    colors: c.colors ?? [...new Set((faces ?? []).flatMap((f) => f.colors ?? []))],
    ci: c.color_identity,
    type: c.type_line ?? (faces ?? []).map((f) => f.type_line ?? "").join(" // "),
    text: c.oracle_text ?? (faces ?? []).map((f) => f.oracle_text ?? "").join("\n//\n"),
    pt: pt(c),
    loy: c.loyalty,
    rarity: c.rarity,
    layout: c.layout,
    faces: faces?.map((f) => ({
      name: f.name,
      cost: f.mana_cost,
      type: f.type_line,
      text: f.oracle_text,
      pt: pt(f),
      loy: f.loyalty,
    })),
    img: frontImg?.small,
    back: !c.image_uris && faces?.[1]?.image_uris ? true : undefined,
  };
}
