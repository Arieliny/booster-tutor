/**
 * "Check Cube Cobra" (My cube, Ari 2026-11-18): have any of the cubes I follow changed since
 * this version of the app was built?
 *
 * The cubes are the cube review's four (yours, LSV, MTGO Vintage, Arena Powered). Their lists
 * and changelogs are fetched when the app is built (scripts/build-cube-review.mjs), so the app
 * only knows them as of its last build. This asks Cube Cobra for each list now and compares.
 *
 * Uses /cube/api/cubelist (names only, a few KB, CORS-enabled) and compares front-face names,
 * case-insensitively, the same way CubeCobraStatus does for library cubes. A printing-only
 * change isn't reported: it doesn't change what's in the cube.
 */
import { CUBE_KEYS, card, data, frontName, hasCard, type CubeKey } from "./cube-review";

export interface CubeChanges {
  key: CubeKey;
  label: string;
  cubeId: string;
  /** On Cube Cobra now, not in the app's copy. */
  added: string[];
  /** In the app's copy, no longer on Cube Cobra. */
  removed: string[];
}

export type CubeCheck = CubeChanges | { key: CubeKey; label: string; cubeId: string; error: string };

const nameKey = (name: string) => name.split(" // ")[0].trim().toLowerCase();

/** What changed between the app's copy (card names) and Cube Cobra's list now (its text). */
export function listChanges(appNames: string[], cubeCobraList: string): { added: string[]; removed: string[] } {
  const remote = new Map<string, string>();
  for (const line of cubeCobraList.split("\n")) {
    const name = line.trim();
    if (name) remote.set(nameKey(name), name);
  }
  if (remote.size === 0) throw new Error("Cube Cobra sent an empty list");
  const local = new Map(appNames.map((n) => [nameKey(n), n]));
  return {
    added: [...remote].filter(([k]) => !local.has(k)).map(([, n]) => n),
    removed: [...local].filter(([k]) => !remote.has(k)).map(([, n]) => n),
  };
}

/** The app's copy of one followed cube, as names. */
function appNames(key: CubeKey): string[] {
  return data.cubes[key].cards.filter(hasCard).map((id) => frontName(card(id)));
}

export function hasChanges(c: CubeCheck): boolean {
  return !("error" in c) && c.added.length + c.removed.length > 0;
}

/** Check every followed cube at once. One that can't be reached comes back with `error`. */
export async function checkFollowedCubes(signal?: AbortSignal): Promise<CubeCheck[]> {
  return Promise.all(
    CUBE_KEYS.map(async (key): Promise<CubeCheck> => {
      const { label, cubeId } = data.cubes[key];
      try {
        const res = await fetch(`https://cubecobra.com/cube/api/cubelist/${encodeURIComponent(cubeId)}`, { signal });
        if (!res.ok) throw new Error(`Cube Cobra answered ${res.status}`);
        return { key, label, cubeId, ...listChanges(appNames(key), await res.text()) };
      } catch (err) {
        if (signal?.aborted) throw err;
        return { key, label, cubeId, error: err instanceof Error ? err.message : "Couldn't reach Cube Cobra" };
      }
    }),
  );
}
