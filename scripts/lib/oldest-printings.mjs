/**
 * For every Oracle card, its OLDEST regular printing - the artwork the cube
 * review and card lookup show by default (Ari prefers original art to newer
 * reprints).
 *
 * One streaming pass over Scryfall's "default_cards" bulk file (every English
 * printing) rather than a search per card. Choice, in order:
 *   1. tier: regular paper printing  >  paper promo / variant  >  digital-only
 *      (so Gleemox, MTGO-only, still gets an image)
 *   2. earliest release date
 *   3. lowest collector number (e.g. the plain version over a same-day variant)
 * Never chosen: art cards, tokens, oversized cards, memorabilia (gold-bordered
 * World Championship decks, Collectors' Edition), or printings with no image.
 */
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";

const SKIP_LAYOUTS = new Set(["art_series", "token", "double_faced_token", "emblem"]);
const SKIP_SET_TYPES = new Set(["memorabilia", "token", "minigame"]);

const num = (cn) => {
  const n = parseInt(cn, 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
};

/** @returns {Promise<Map<string, {sid: string, back: boolean, set: string, released: string}>>} */
export async function oldestPrintings({ userAgent }) {
  const index = await (
    await fetch("https://api.scryfall.com/bulk-data", { headers: { "User-Agent": userAgent, Accept: "application/json" } })
  ).json();
  const meta = index.data.find((d) => d.type === "default_cards");
  const url = meta?.download_uri ?? meta?.jsonl_download_uri;
  if (!url) throw new Error("Scryfall bulk index has no default_cards file");
  const res = await fetch(url, { headers: { "User-Agent": userAgent } });
  if (!res.ok) throw new Error(`default_cards download: HTTP ${res.status}`);
  const input = url.endsWith(".gz") ? Readable.fromWeb(res.body).pipe(createGunzip()) : Readable.fromWeb(res.body);
  const jsonl = /\.jsonl(\.gz)?$/.test(url);

  const best = new Map(); // oracle id -> { key, value }
  for await (let line of createInterface({ input, crlfDelay: Infinity })) {
    if (!jsonl) line = line.trim().replace(/^\[|,$|\]$/g, "");
    if (!line.trim()) continue;
    const p = JSON.parse(line);
    const oid = p.oracle_id ?? p.card_faces?.[0]?.oracle_id;
    if (!oid) continue;
    if (SKIP_LAYOUTS.has(p.layout) || SKIP_SET_TYPES.has(p.set_type) || p.oversized) continue;
    if (p.image_status === "missing" || p.image_status === "placeholder") continue;
    if (!(p.image_uris ?? p.card_faces?.[0]?.image_uris)) continue;

    const tier = p.digital ? 2 : p.promo || p.variation ? 1 : 0;
    const key = [tier, p.released_at ?? "9999", num(p.collector_number)];
    const cur = best.get(oid);
    const better =
      !cur ||
      key[0] < cur.key[0] ||
      (key[0] === cur.key[0] && (key[1] < cur.key[1] || (key[1] === cur.key[1] && key[2] < cur.key[2])));
    if (better) {
      best.set(oid, {
        key,
        value: {
          sid: p.id,
          back: !p.image_uris && !!p.card_faces?.[1]?.image_uris,
          set: p.set,
          released: p.released_at,
        },
      });
    }
  }
  return new Map([...best].map(([k, v]) => [k, v.value]));
}

/** Scryfall image URL from a printing id (no cache-busting query needed). */
export function smallImageUrl(sid) {
  return `https://cards.scryfall.io/small/front/${sid[0]}/${sid[1]}/${sid}.jpg`;
}
