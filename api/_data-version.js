// Plain JS (not TS) so both the build script (scripts/write-data-version.mjs)
// and the daily check (api/_data-refresh.ts) can use it.

/** Any query that matches every card: Scryfall's count of distinct cards. */
const COUNT_URL = "https://api.scryfall.com/cards/search?q=" + encodeURIComponent("year>=1993");

/** A rebuild at least this often anyway, for Oracle errata and late fixes. */
export const MAX_AGE_DAYS = 14;

/** How many distinct cards Scryfall knows right now (new previews push it up). */
export async function scryfallTotal() {
  const res = await fetch(COUNT_URL, {
    headers: { "User-Agent": "BoosterTutor/1.0 (data check)", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from Scryfall`);
  const body = await res.json();
  if (typeof body.total_cards !== "number") throw new Error("Scryfall gave no card count");
  return body.total_cards;
}

/**
 * Why this deploy's data is out of date, or [] if it isn't.
 * @param {null | {builtAt?: string, cards?: {total?: number|null}|null, cr?: {source?: string}|null}} version  what the deploy was built from
 * @param {{total: number|null, crSource: string|null}} live  what's out there now (null = couldn't tell; never a reason)
 * @param {Date} now
 * @returns {string[]}
 */
export function staleReasons(version, live, now) {
  if (!version) return ["this deploy has no data-version file"];
  const reasons = [];
  if (live.crSource && live.crSource !== version.cr?.source) reasons.push(`new Comprehensive Rules: ${live.crSource}`);
  if (live.total !== null && live.total !== version.cards?.total)
    reasons.push(`Scryfall has ${live.total} cards, this deploy was built when it had ${version.cards?.total ?? "?"}`);
  const age = version.builtAt ? (now.getTime() - Date.parse(version.builtAt)) / 86_400_000 : Infinity;
  if (!(age < MAX_AGE_DAYS)) reasons.push(`built more than ${MAX_AGE_DAYS} days ago`);
  return reasons;
}
