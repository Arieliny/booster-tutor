// Plain JS (not TS) so both the build script (scripts/write-data-version.mjs)
// and the daily check (api/_data-refresh.ts) can use it.

/** Any query that matches every card: Scryfall's count of distinct cards. */
const COUNT_URL = "https://api.scryfall.com/cards/search?q=" + encodeURIComponent("year>=1993");

/** A rebuild at least this often anyway, for Oracle errata and late fixes. */
export const MAX_AGE_DAYS = 14;

/**
 * How many distinct cards Scryfall knows right now (new previews push it up).
 * Retries a few times: in the build it runs straight after the card downloads,
 * and Scryfall can answer 429 (slow down) then.
 */
export async function scryfallTotal(waits = [2000, 5000, 10000]) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(COUNT_URL, {
      headers: { "User-Agent": "BoosterTutor/1.0 (data check)", Accept: "application/json" },
    });
    if (res.ok) {
      const body = await res.json();
      if (typeof body.total_cards !== "number") throw new Error("Scryfall gave no card count");
      return body.total_cards;
    }
    if (attempt >= waits.length || !(res.status === 429 || res.status >= 500)) throw new Error(`HTTP ${res.status} from Scryfall`);
    await new Promise((r) => setTimeout(r, waits[attempt]));
  }
}

/**
 * A short fingerprint of a card list (order and repeats don't matter): which
 * cards "My cube" was built from, so the daily check can tell when the Cube
 * Cobra list has changed (a commit from the Commit changes screen).
 * @param {string[]} ids  Oracle ids
 */
export function listHash(ids) {
  const sorted = [...new Set(ids)].sort();
  let h = 2166136261;
  for (const id of sorted) for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return `${sorted.length}-${h.toString(36)}`;
}

/**
 * The Oracle ids on a Cube Cobra cube's mainboard, from its public JSON.
 * @param {string} cubeId
 */
export async function cubeCobraOracleIds(cubeId) {
  const res = await fetch(`https://cubecobra.com/cube/api/cubeJSON/${encodeURIComponent(cubeId)}`, {
    headers: { "User-Agent": "BoosterTutor/1.0 (data check)", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from Cube Cobra`);
  const body = await res.json();
  const main = body?.cards?.mainboard;
  if (!Array.isArray(main) || !main.length) throw new Error("Cube Cobra gave no mainboard");
  return main.map((c) => c?.details?.oracle_id).filter(Boolean);
}

/**
 * Why this deploy's data is out of date, or [] if it isn't.
 * @param {null | {builtAt?: string, cards?: {total?: number|null}|null, cr?: {source?: string}|null, mine?: {hash?: string}|null}} version  what the deploy was built from
 * @param {{total: number|null, crSource: string|null, mine?: string|null}} live  what's out there now (null = couldn't tell; never a reason)
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
  if (live.mine && version.mine?.hash && live.mine !== version.mine.hash) reasons.push("your Cube Cobra cube changed");
  if (!(age < MAX_AGE_DAYS)) reasons.push(`built more than ${MAX_AGE_DAYS} days ago`);
  return reasons;
}
