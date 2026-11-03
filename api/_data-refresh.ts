import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { crUrl } from "./_cr-parse.js";
import { type DataVersion, scryfallTotal, staleReasons } from "./_data-version.js";
import { redis } from "./_redis.js";

/**
 * Keeps the offline card database and the judge's Comprehensive Rules current
 * without anyone pushing code. Both are fetched at build time, so when either
 * is out of date this asks Vercel for a fresh production build through the
 * project's Deploy Hook (env DEPLOY_HOOK_URL, set per Vercel project, so
 * Booster Tutor and LifeTutor each rebuild themselves).
 *
 * Out of date = Wizards' rules page links a different CR file, or Scryfall's
 * card count changed (new set previews, new cards), or the build is older than
 * MAX_AGE_DAYS. Runs from the daily cron (api/keepalive.ts); at most one
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
  const [total, crSource] = await Promise.all([
    scryfallTotal().catch(() => null),
    crUrl().catch(() => null),
  ]);
  const reasons = staleReasons(version, { total, crSource }, now);
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
