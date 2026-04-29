/**
 * Higher-level cube/session API. Wraps idb.ts with the bootstrap behavior
 * (seed bundled cube, migrate legacy localStorage) and the "currently selected
 * cube" concept.
 */

import {
  clearSession as idbClearSession,
  deleteCube as idbDeleteCube,
  getAllCubes,
  getCube,
  getMeta,
  getSession,
  putCube,
  putSession,
  setMeta,
} from "./idb";
import { loadBundledCube } from "./bundled-cube";
import type { Cube, CubeSession } from "../types";

const META_SELECTED_CUBE = "selectedCubeId";
const META_BUNDLED_SEEDED = "bundledSeededAt";
const LEGACY_LOCALSTORAGE_KEY = "booster-tutor-state";

export async function bootstrap(): Promise<{
  cubes: Cube[];
  selectedCubeId: string;
}> {
  // First-time setup: seed the bundled cube if no cubes exist.
  let cubes = await getAllCubes();
  if (cubes.length === 0 && !(await getMeta(META_BUNDLED_SEEDED))) {
    const bundled = loadBundledCube();
    await putCube(bundled);
    await setMeta(META_BUNDLED_SEEDED, new Date().toISOString());
    cubes = [bundled];

    // Migrate legacy localStorage (if any) into the bundled cube's session.
    try {
      const legacy = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy) as {
          pickedCardIds?: string[];
          lastUpdated?: string;
        };
        if (Array.isArray(parsed.pickedCardIds) && parsed.pickedCardIds.length > 0) {
          await putSession(bundled.id, {
            pickedCardIds: parsed.pickedCardIds,
            lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
          });
        }
        localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
      }
    } catch {
      // Legacy migration is best-effort. Ignore parse errors.
    }
  }

  // Select first cube if nothing is selected, or if the selected cube was deleted.
  const selectedRaw = await getMeta<string>(META_SELECTED_CUBE);
  let selectedCubeId = selectedRaw ?? cubes[0]?.id ?? "";
  if (!cubes.some((c) => c.id === selectedCubeId)) {
    selectedCubeId = cubes[0]?.id ?? "";
  }
  if (selectedCubeId) await setMeta(META_SELECTED_CUBE, selectedCubeId);

  return { cubes, selectedCubeId };
}

export async function selectCube(cubeId: string): Promise<void> {
  await setMeta(META_SELECTED_CUBE, cubeId);
}

export async function listCubes(): Promise<Cube[]> {
  return getAllCubes();
}

export async function loadCube(id: string): Promise<Cube | undefined> {
  return getCube(id);
}

export async function saveCube(cube: Cube): Promise<void> {
  await putCube(cube);
}

export async function removeCube(id: string): Promise<void> {
  await idbDeleteCube(id);
}

export async function loadSession(cubeId: string): Promise<CubeSession> {
  const existing = await getSession(cubeId);
  if (existing) return existing;
  return { pickedCardIds: [], lastUpdated: new Date().toISOString() };
}

export async function saveSession(
  cubeId: string,
  pickedCardIds: string[],
): Promise<void> {
  await putSession(cubeId, {
    pickedCardIds,
    lastUpdated: new Date().toISOString(),
  });
}

export async function resetSession(cubeId: string): Promise<void> {
  await idbClearSession(cubeId);
}

export function makeCubeId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${slug || "cube"}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Resolve a name conflict by appending " (2)", " (3)" etc.
 */
export async function uniqueCubeName(desired: string): Promise<string> {
  const all = await getAllCubes();
  const taken = new Set(all.map((c) => c.name));
  if (!taken.has(desired)) return desired;
  let i = 2;
  while (taken.has(`${desired} (${i})`)) i++;
  return `${desired} (${i})`;
}
