import { redis } from "./_redis.js";

/**
 * Card lookups for the judge: current Oracle text, official rulings and
 * legality from Scryfall, rendered as text the way the mtg-judge skill does.
 * Cached in Redis for a day, so a card asked about twice costs one lookup.
 */

const HEADERS = { "User-Agent": "BoosterTutor/1.0 (personal cube tool)", Accept: "application/json" };
const DAY = 24 * 60 * 60;
const MAX_RULINGS = 20;

interface Face {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
}
interface ScryCard extends Face {
  name: string;
  layout?: string;
  card_faces?: Face[];
  legalities?: Record<string, string>;
  color_identity?: string[];
  game_changer?: boolean;
  all_parts?: { name: string; component?: string }[];
  rulings_uri?: string;
  scryfall_uri?: string;
}
export interface Ruling {
  published_at: string;
  source?: string;
  comment: string;
}
interface Cached {
  card: ScryCard;
  rulings: Ruling[];
}

const cacheKey = (name: string) => `sf:card:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80)}`;

/** Only what rendering needs, so cache entries stay small. */
function trim(c: ScryCard): ScryCard {
  const face = (f: Face): Face => ({
    name: f.name,
    mana_cost: f.mana_cost,
    type_line: f.type_line,
    oracle_text: f.oracle_text,
    power: f.power,
    toughness: f.toughness,
    loyalty: f.loyalty,
    defense: f.defense,
  });
  return {
    ...face(c),
    name: c.name,
    layout: c.layout,
    card_faces: c.card_faces?.map(face),
    legalities: c.legalities,
    color_identity: c.color_identity,
    game_changer: c.game_changer,
    all_parts: c.all_parts?.map((p) => ({ name: p.name, component: p.component })),
    rulings_uri: c.rulings_uri,
    scryfall_uri: c.scryfall_uri,
  };
}

async function getJson<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T | null }> {
  const res = await fetch(url, { ...init, headers: { ...HEADERS, ...(init?.headers ?? {}) } });
  return { status: res.status, data: res.ok ? ((await res.json()) as T) : null };
}

async function rulingsFor(c: ScryCard): Promise<Ruling[]> {
  if (!c.rulings_uri) return [];
  const { data } = await getJson<{ data: Ruling[] }>(c.rulings_uri);
  return (data?.data ?? []).map((r) => ({ published_at: r.published_at, source: r.source, comment: r.comment }));
}

/** Official rulings for one card by exact name (also used by the card popup). */
export async function cardWithRulings(name: string): Promise<Cached | null> {
  const [hit] = await fetchCards([name]);
  return "card" in hit ? hit : null;
}

/** Look cards up: cache, then one batched request, then fuzzy matching for misses. */
async function fetchCards(names: string[]): Promise<(Cached | { error: string })[]> {
  const cached = names.length
    ? ((await redis.mget<(Cached | null)[]>(...names.map(cacheKey))) ?? names.map(() => null))
    : [];
  const result = new Map<string, Cached | { error: string }>();
  const need = names.filter((n, i) => (cached[i] ? (result.set(n, cached[i] as Cached), false) : true));

  if (need.length) {
    const found: ScryCard[] = [];
    const { data } = await getJson<{ data: ScryCard[] }>("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers: need.slice(0, 75).map((name) => ({ name })) }),
    });
    found.push(...(data?.data ?? []));
    const names_ = (c: ScryCard) => [c.name, ...(c.card_faces ?? []).map((f) => f.name ?? "")].map((s) => s.toLowerCase());
    for (const n of need) {
      let c = found.find((f) => names_(f).includes(n.toLowerCase()));
      if (!c) {
        const fuzzy = await getJson<ScryCard>(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(n)}`);
        if (fuzzy.data) c = fuzzy.data;
        else {
          const sugg = await getJson<{ data: string[] }>(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(n)}`);
          const list = sugg.data?.data.slice(0, 8) ?? [];
          result.set(n, { error: `NOT FOUND: '${n}'.` + (list.length ? ` Did you mean: ${list.join("; ")}` : "") });
          continue;
        }
      }
      const entry: Cached = { card: trim(c), rulings: await rulingsFor(c) };
      result.set(n, entry);
      await redis.set(cacheKey(n), entry, { ex: DAY });
      if (c.name.toLowerCase() !== n.toLowerCase()) await redis.set(cacheKey(c.name), entry, { ex: DAY });
    }
  }
  return names.map((n) => result.get(n) ?? { error: `NOT FOUND: '${n}'` });
}

function faceBlock(f: Face): string[] {
  const out = [[f.name, f.mana_cost].filter(Boolean).join(" "), f.type_line ?? ""];
  if (f.oracle_text) out.push(f.oracle_text);
  const stats = [
    f.power !== undefined ? `P/T ${f.power}/${f.toughness}` : "",
    f.loyalty !== undefined ? `Loyalty ${f.loyalty}` : "",
    f.defense !== undefined ? `Defense ${f.defense}` : "",
  ].filter(Boolean);
  if (stats.length) out.push(stats.join(" | "));
  return out;
}

function render({ card: c, rulings }: Cached, legality: boolean): string {
  const out = [`=== ${c.name} ===  (layout: ${c.layout})`];
  if (c.card_faces?.length && !c.oracle_text) for (const f of c.card_faces) out.push("--- face ---", ...faceBlock(f));
  else out.push(...faceBlock(c));
  if (legality && c.legalities) {
    for (const status of ["restricted", "banned"]) {
      const fmts = Object.entries(c.legalities).filter(([, v]) => v === status).map(([k]) => k);
      if (fmts.length) out.push(`${status[0].toUpperCase() + status.slice(1)}: ${fmts.join(", ")}`);
    }
    const legal = Object.entries(c.legalities).filter(([, v]) => v === "legal").map(([k]) => k);
    if (legal.length) out.push("Legal: " + legal.join(", "));
  }
  if (c.color_identity) out.push("Color identity: " + (c.color_identity.join("") || "colorless"));
  if (c.game_changer) out.push("Commander: on the Game Changers list");
  const parts = (c.all_parts ?? []).filter((p) => p.name !== c.name);
  if (parts.length) out.push("Related: " + parts.map((p) => `${p.name} (${p.component})`).join("; "));
  if (rulings.length) {
    const shown = rulings.slice(-MAX_RULINGS);
    out.push(`Official rulings (${rulings.length}${shown.length < rulings.length ? `, showing newest ${shown.length}` : ""}):`);
    out.push(...shown.map((r) => `- ${r.published_at} [${r.source}] ${r.comment}`));
  } else out.push("Official rulings: none");
  out.push(`Source: ${(c.scryfall_uri ?? "").split("?")[0]}`);
  return out.join("\n");
}

/** Text blocks for the judge, one per card (or a NOT FOUND line). */
export async function lookupCards(names: string[], legality = true): Promise<string[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 20);
  const hits = await fetchCards(unique);
  return hits.map((h) => ("error" in h ? h.error : render(h, legality)));
}
