import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { crUrl } from "./_cr-parse.js";
import { type DataVersion, cubeCobraOracleIds, listHash, scryfallTotal, staleReasons, watchedCubes } from "./_data-version.js";
import { redis } from "./_redis.js";

/**
 * Keeps the offline card database and the judge's Comprehensive Rules current
 * without anyone pushing code. Both are fetched at build time, so when either
 * is out of date this asks Vercel for a fresh production build through the
 * project's Deploy Hook (env DEPLOY_HOOK_URL, set per Vercel project, so
 * Booster Tutor and LifeTutor each rebuild themselves).
 *
 * Out of date = Wizards' rules page links a different CR file, or Scryfall's
 * card count changed (new set previews, new cards), or a Cube Cobra cube isn't
 * the list the cube review was built from (Ari's, after a commit from Commit
 * changes, or LSV / MTGO / Arena updating theirs; Booster Tutor only: LifeTutor
 * has no cubes), or the build is older than MAX_AGE_DAYS. Runs from the daily cron (api/keepalive.ts); at most one
 * rebuild a day per project, so a build that keeps failing can't loop.
 */
export interface RefreshResult {
  action: "current" | "rebuilding" | "waiting" | "no-hook" | "hook-failed";
  reasons: string[];
}

const GAP_SECONDS = 20 * 60 * 60;

export async function refreshData(now = new Date()): Promise<RefreshResult> {
  let version: DataVersion | null = null;
  try {
    version = JSON.parse(await readFile(join(process.cwd(), "data", "data-version.json"), "utf8")) as DataVersion;
  } catch {
    // An older deploy, or the build step failed: staleReasons says so.
  }
  const watched = process.env.VITE_APP === "table" ? [] : Object.entries(watchedCubes(version)).filter(([, c]) => c.cubeId);
  const [total, crSource, hashes] = await Promise.all([
    scryfallTotal([1000]).catch(() => null),
    crUrl().catch(() => null),
    Promise.all(watched.map(([, c]) => cubeCobraOracleIds(c.cubeId!).then(listHash, () => null))),
  ]);
  const cubes = Object.fromEntries(watched.map(([key], i) => [key, hashes[i]]));
  // The build couldn't get Scryfall's count (it can be rate-limited right after
  // the downloads): the first check after the deploy records today's as the
  // baseline instead of calling the build stale for a count it never had.
  if (version?.cards && typeof version.cards.total !== "number" && total !== null) {
    const key = `data-refresh:baseline:${process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_URL ?? "local"}`;
    const saved = await redis.get<number>(key);
    if (typeof saved !== "number") await redis.set(key, total, { ex: 30 * 86_400 });
    version = { ...version, cards: { ...version.cards, total: typeof saved === "number" ? saved : total } };
  }
  const reasons = staleReasons(version, { total, crSource, cubes }, now);
  if (reasons.length === 0) return { action: "current", reasons };

  const hook = process.env.DEPLOY_HOOK_URL;
  if (!hook) return { action: "no-hook", reasons };
  // The two projects share one Redis, so the gap is per project.
  const key = `data-refresh:last:${process.env.VERCEL_PROJECT_ID ?? "local"}`;
  if (await redis.get(key)) return { action: "waiting", reasons };
  const res = await fetch(hook, { method: "POST" });
  if (!res.ok) return { action: "hook-failed", reasons: [...reasons, `deploy hook: HTTP ${res.status}`] };
  await redis.set(key, now.toISOString(), { ex: GAP_SECONDS });
  return { action: "rebuilding", reasons };
}
