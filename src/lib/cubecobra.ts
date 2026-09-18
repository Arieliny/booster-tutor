/**
 * CubeCobra import.
 *
 * CubeCobra exposes two CORS-enabled endpoints (`access-control-allow-origin: *`),
 * so this runs entirely in the browser — no serverless proxy needed:
 *   - /cube/api/cubeJSON/{id}  full cube JSON  (what we use)
 *   - /cube/api/cubelist/{id}  plain names only
 * (The /cube/download/* exports are NOT CORS-enabled and can't be fetched here.)
 *
 * Every CubeCobra card carries its `scryfall_id`, so we skip the slow
 * one-request-per-card enrichment the paste/upload flow needs and batch the
 * whole cube through Scryfall's /cards/collection (75 per request).
 */

import type { Cube, CubeCard, ParseFailure } from "../types";
import { fetchCardsByIds } from "./scryfall-enrich";

export interface CubeCobraImport {
  cubecobraId: string;
  /** The cube's name on CubeCobra. */
  name: string;
  cards: CubeCard[];
  failures: ParseFailure[];
  /**
   * Repeated printings dropped during import. The app keys cards by
   * scryfall_id (picked-card tracking, draft claims), so the same printing
   * twice would collide — cubes are nearly always singleton anyway.
   */
  duplicatesSkipped: number;
}

export interface ImportProgress {
  done: number;
  total: number;
}

interface CobraCardEntry {
  cardID?: unknown;
  details?: { scryfall_id?: unknown; name?: unknown };
}

/**
 * Pull a cube id out of whatever the user pasted: a full URL
 * (https://cubecobra.com/cube/overview/abcd, /cube/list/abcd, …) or a bare id.
 */
export function parseCubeCobraId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (/^https?:\/\//i.test(trimmed) || /cubecobra\.com/i.test(trimmed)) {
    try {
      const url = new URL(
        /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
      );
      const segments = url.pathname.split("/").filter(Boolean);
      candidate = segments[segments.length - 1] ?? "";
    } catch {
      return null;
    }
  }

  candidate = candidate.split("?")[0].split("#")[0].trim();
  return /^[A-Za-z0-9_-]{1,100}$/.test(candidate) ? candidate : null;
}

export async function importFromCubeCobra(
  id: string,
  options: {
    onProgress?: (p: ImportProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<CubeCobraImport> {
  const res = await fetch(
    `https://cubecobra.com/cube/api/cubeJSON/${encodeURIComponent(id)}`,
    { headers: { Accept: "application/json" }, signal: options.signal },
  );
  if (res.status === 404) {
    throw new Error("No cube found with that CubeCobra ID.");
  }
  if (!res.ok) {
    throw new Error(`CubeCobra returned HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    name?: unknown;
    cards?: { mainboard?: unknown };
  };
  const mainboard = json.cards?.mainboard;
  if (!Array.isArray(mainboard) || mainboard.length === 0) {
    throw new Error("That cube's mainboard is empty.");
  }

  // Collect scryfall ids in cube order, dropping repeats.
  const ids: string[] = [];
  const seen = new Set<string>();
  const nameById = new Map<string, string>();
  let duplicatesSkipped = 0;

  for (const raw of mainboard as CobraCardEntry[]) {
    const sid =
      typeof raw?.details?.scryfall_id === "string"
        ? raw.details.scryfall_id
        : typeof raw?.cardID === "string"
          ? raw.cardID
          : null;
    if (!sid) continue;
    if (seen.has(sid)) {
      duplicatesSkipped++;
      continue;
    }
    seen.add(sid);
    ids.push(sid);
    if (typeof raw?.details?.name === "string") nameById.set(sid, raw.details.name);
  }

  if (ids.length === 0) {
    throw new Error("No recognizable cards in that cube.");
  }

  const { cards, notFoundIds } = await fetchCardsByIds(ids, {
    signal: options.signal,
    onProgress: (done, total) => options.onProgress?.({ done, total }),
  });

  const failures: ParseFailure[] = notFoundIds.map((missing) => ({
    line: nameById.get(missing) ?? missing,
    reason: "Not found on Scryfall (custom or unsupported card)",
  }));

  return {
    cubecobraId: id,
    name: typeof json.name === "string" && json.name.trim() ? json.name.trim() : "CubeCobra cube",
    cards,
    failures,
    duplicatesSkipped,
  };
}

/** Added / removed card counts between an existing cube and a fresh import. */
export function diffCards(
  before: CubeCard[],
  after: CubeCard[],
): { added: number; removed: number } {
  const beforeIds = new Set(before.map((c) => c.scryfall_id));
  const afterIds = new Set(after.map((c) => c.scryfall_id));
  let added = 0;
  let removed = 0;
  for (const id of afterIds) if (!beforeIds.has(id)) added++;
  for (const id of beforeIds) if (!afterIds.has(id)) removed++;
  return { added, removed };
}

/** True when a cube can be re-pulled from CubeCobra. */
export function isCubeCobraCube(cube: Cube): boolean {
  return typeof cube.cubecobraId === "string" && cube.cubecobraId.length > 0;
}
