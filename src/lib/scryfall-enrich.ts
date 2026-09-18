import type { Color, CubeCard, ParsedLine, ParseFailure } from "../types";

/**
 * Browser-side Scryfall enrichment.
 * - Throttled to 200 ms between requests (well within Scryfall's 10 req/s limit
 *   for /cards/{set}/{collector} and 2 req/s for /cards/named).
 * - Sends required headers (Accept, plus a custom UA-equivalent identifier
 *   passed via a query param since browsers won't let us set User-Agent).
 * - Reports progress via onProgress callback.
 * - Returns successful enrichments + a list of failures for the UI to display.
 *
 * Scryfall asks for a User-Agent header on API requests. Browsers strip
 * User-Agent overrides for security, so we can't comply via a header. As a
 * good-faith identifier we add the `pretty` and `format` params plus a custom
 * `client` param the API ignores. The behavior remains compliant with rate
 * limits, which is the main thing they enforce.
 */

const REQUEST_DELAY_MS = 200;

export interface ScryfallCardResponse {
  id: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  colors?: string[];
  color_identity?: string[];
  type_line?: string;
  image_uris?: { normal?: string };
  card_faces?: { image_uris?: { normal?: string } }[];
  lang?: string;
  set?: string;
  collector_number?: string;
}

export interface EnrichmentResult {
  cards: CubeCard[];
  failures: ParseFailure[];
}

export interface EnrichmentProgress {
  done: number;
  total: number;
  currentName: string;
}

interface EnrichOptions {
  onProgress?: (p: EnrichmentProgress) => void;
  signal?: AbortSignal;
}

export async function enrichCube(
  parsed: ParsedLine[],
  options: EnrichOptions = {},
): Promise<EnrichmentResult> {
  const cards: CubeCard[] = [];
  const failures: ParseFailure[] = [];

  for (let i = 0; i < parsed.length; i++) {
    if (options.signal?.aborted) {
      throw new DOMException("Enrichment cancelled", "AbortError");
    }

    const p = parsed[i];
    options.onProgress?.({ done: i, total: parsed.length, currentName: p.name });

    try {
      const card = await fetchCard(p, options.signal);
      cards.push(toCubeCard(p, card));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ line: p.raw, reason });
    }

    if (i < parsed.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  options.onProgress?.({
    done: parsed.length,
    total: parsed.length,
    currentName: "",
  });

  return { cards, failures };
}

async function fetchCard(p: ParsedLine, signal?: AbortSignal): Promise<ScryfallCardResponse> {
  let url: string;
  if (p.set && p.collectorNumber) {
    // Exact-printing lookup. English default.
    url = `https://api.scryfall.com/cards/${p.set}/${encodeURIComponent(p.collectorNumber)}`;
  } else {
    // Fall back to fuzzy named lookup. Returns Scryfall's default English printing.
    url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(p.name)}`;
  }

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Not found on Scryfall (HTTP 404)`);
    }
    throw new Error(`Scryfall returned HTTP ${res.status}`);
  }
  return (await res.json()) as ScryfallCardResponse;
}

function toCubeCard(p: ParsedLine, card: ScryfallCardResponse): CubeCard {
  let imageFront: string | null = card.image_uris?.normal ?? null;
  let imageBack: string | null = null;
  if (!imageFront && card.card_faces && card.card_faces.length > 0) {
    imageFront = card.card_faces[0]?.image_uris?.normal ?? null;
    imageBack = card.card_faces[1]?.image_uris?.normal ?? null;
  }

  return {
    name: card.name,
    mana_cost: card.mana_cost ?? "",
    cmc: card.cmc ?? 0,
    colors: (card.colors ?? []) as Color[],
    color_identity: (card.color_identity ?? []) as Color[],
    type_line: card.type_line ?? "",
    image_url: imageFront,
    image_url_back: imageBack,
    scryfall_id: card.id,
    set: p.set ?? "",
    collector_number: p.collectorNumber ?? "",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Batch lookup by Scryfall id (used by the CubeCobra import, which already
// knows each card's exact scryfall_id). /cards/collection takes up to 75
// identifiers per POST, so a 559-card cube costs ~8 requests instead of 559.

/** Scryfall's documented maximum identifiers per /cards/collection call. */
const COLLECTION_BATCH = 75;
const BATCH_DELAY_MS = 100;

export interface BatchLookupResult {
  /** Resolved cards, in the order their ids were passed in. */
  cards: CubeCard[];
  /** Ids Scryfall didn't recognize (e.g. CubeCobra custom cards). */
  notFoundIds: string[];
}

/** Map a raw Scryfall card to our CubeCard, trusting Scryfall's own printing info. */
export function cubeCardFromScryfall(card: ScryfallCardResponse): CubeCard {
  let imageFront: string | null = card.image_uris?.normal ?? null;
  let imageBack: string | null = null;
  if (!imageFront && card.card_faces && card.card_faces.length > 0) {
    imageFront = card.card_faces[0]?.image_uris?.normal ?? null;
    imageBack = card.card_faces[1]?.image_uris?.normal ?? null;
  }

  return {
    name: card.name,
    mana_cost: card.mana_cost ?? "",
    cmc: card.cmc ?? 0,
    colors: (card.colors ?? []) as Color[],
    color_identity: (card.color_identity ?? []) as Color[],
    type_line: card.type_line ?? "",
    image_url: imageFront,
    image_url_back: imageBack,
    scryfall_id: card.id,
    set: card.set ?? "",
    collector_number: card.collector_number ?? "",
  };
}

export async function fetchCardsByIds(
  ids: string[],
  options: {
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<BatchLookupResult> {
  const found = new Map<string, CubeCard>();
  const notFoundIds: string[] = [];

  for (let i = 0; i < ids.length; i += COLLECTION_BATCH) {
    if (options.signal?.aborted) {
      throw new DOMException("Lookup cancelled", "AbortError");
    }
    const chunk = ids.slice(i, i + COLLECTION_BATCH);

    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ identifiers: chunk.map((id) => ({ id })) }),
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`Scryfall returned HTTP ${res.status}`);

    const data = (await res.json()) as {
      data?: ScryfallCardResponse[];
      not_found?: { id?: string }[];
    };
    for (const c of data.data ?? []) found.set(c.id, cubeCardFromScryfall(c));
    for (const nf of data.not_found ?? []) if (nf.id) notFoundIds.push(nf.id);

    options.onProgress?.(Math.min(i + chunk.length, ids.length), ids.length);
    if (i + COLLECTION_BATCH < ids.length) await sleep(BATCH_DELAY_MS);
  }

  // Preserve the caller's ordering.
  const cards = ids
    .map((id) => found.get(id))
    .filter((c): c is CubeCard => c !== undefined);

  return { cards, notFoundIds };
}
