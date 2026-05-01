/**
 * Higher-level cube/session/inventory API. Wraps idb.ts with the bootstrap
 * behavior (seed bundled cube, migrate legacy localStorage), the "currently
 * selected cube" concept, and (when a sync code is configured) cloud sync
 * via /api/sync.
 */

import {
  clearSession as idbClearSession,
  getAllCubes,
  getCube,
  getInventory,
  getMeta,
  getSession,
  putCube,
  putInventory,
  putSession,
  setMeta,
} from "./idb";
import { loadBundledCube } from "./bundled-cube";
import {
  fetchCube,
  getSyncCode,
  pullSync,
  pushArchive,
  pushCube,
  pushInventory,
  pushRestore,
} from "./sync";
import type { Cube, CubeSession } from "../types";

const META_SELECTED_CUBE = "selectedCubeId";
const META_BUNDLED_SEEDED = "bundledSeededAt";
const LEGACY_LOCALSTORAGE_KEY = "booster-tutor-state";

export async function bootstrap(): Promise<{
  cubes: Cube[];
  selectedCubeId: string;
  syncedAt: string | null;
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
      // Legacy migration is best-effort.
    }
  }

  // If a sync code is configured, reconcile local IDB with the server.
  let syncedAt: string | null = null;
  const code = getSyncCode();
  if (code) {
    try {
      cubes = await reconcileFromServer(code, cubes);
      syncedAt = new Date().toISOString();
    } catch (err) {
      console.warn("Sync reconcile failed; continuing with local state.", err);
    }
  }

  // Select first non-archived cube if nothing is selected (or selected was archived/deleted).
  const selectedRaw = await getMeta<string>(META_SELECTED_CUBE);
  const visible = cubes.filter((c) => !c.archived);
  let selectedCubeId =
    selectedRaw && cubes.some((c) => c.id === selectedRaw && !c.archived)
      ? selectedRaw
      : visible[0]?.id ?? cubes[0]?.id ?? "";
  if (selectedCubeId) await setMeta(META_SELECTED_CUBE, selectedCubeId);

  return { cubes, selectedCubeId, syncedAt };
}

/**
 * Pull the server's snapshot and merge it into local IDB. Server is
 * authoritative on conflicts (last write wins; the client always saves to
 * the server before saving locally).
 */
async function reconcileFromServer(code: string, localCubes: Cube[]): Promise<Cube[]> {
  const remote = await pullSync(code);
  const localById = new Map(localCubes.map((c) => [c.id, c]));

  // Push any local cubes the server doesn't know about (first sync from a
  // device that already has data).
  for (const local of localCubes) {
    if (!remote.meta.cubes[local.id]) {
      try {
        await pushCube(code, local);
        if (local.archived) await pushArchive(code, local.id);
      } catch (err) {
        console.warn(`Failed to push existing local cube ${local.id}`, err);
      }
    }
  }

  // For every remote cube, ensure local matches.
  for (const meta of Object.values(remote.meta.cubes)) {
    const localEntry = localById.get(meta.id);
    if (!localEntry) {
      // We don't have this cube locally — fetch full body and store.
      try {
        const cube = await fetchCube(code, meta.id);
        cube.archived = meta.archived;
        await putCube(cube);
        localById.set(meta.id, cube);
      } catch (err) {
        console.warn(`Failed to fetch remote cube ${meta.id}`, err);
      }
    } else if (localEntry.archived !== meta.archived || localEntry.name !== meta.name) {
      // Existing cube; sync archived flag + name from server. (Card data
      // hasn't been re-pushed independently; we trust the local card list.)
      const updated = { ...localEntry, archived: meta.archived, name: meta.name };
      await putCube(updated);
      localById.set(meta.id, updated);
    }
  }

  // Push local inventories for any cube the server doesn't have one for.
  for (const cubeId of localById.keys()) {
    if (!(cubeId in remote.inventories)) {
      const local = await getInventory(cubeId);
      if (local && local.length > 0) {
        try {
          await pushInventory(code, cubeId, local);
        } catch (err) {
          console.warn(`Failed to push inventory for ${cubeId}`, err);
        }
      }
    }
  }

  // Pull remote inventories into local IDB (server is authoritative).
  for (const [cubeId, ids] of Object.entries(remote.inventories)) {
    await putInventory(cubeId, ids);
  }

  return Array.from(localById.values());
}

// ---------- selection ----------

export async function selectCube(cubeId: string): Promise<void> {
  await setMeta(META_SELECTED_CUBE, cubeId);
}

// ---------- cubes ----------

export async function listCubes(): Promise<Cube[]> {
  return getAllCubes();
}

export async function loadCube(id: string): Promise<Cube | undefined> {
  return getCube(id);
}

export async function saveCube(cube: Cube): Promise<void> {
  await putCube(cube);
  const code = getSyncCode();
  if (code) {
    try {
      await pushCube(code, cube);
    } catch (err) {
      console.warn("Failed to push cube to sync.", err);
    }
  }
}

export async function archiveCube(id: string): Promise<void> {
  const cube = await getCube(id);
  if (!cube) return;
  cube.archived = true;
  await putCube(cube);
  const code = getSyncCode();
  if (code) {
    try {
      await pushArchive(code, id);
    } catch (err) {
      console.warn("Failed to push archive to sync.", err);
    }
  }
  await idbClearSession(id);
}

export async function restoreCube(id: string): Promise<void> {
  const cube = await getCube(id);
  if (!cube) return;
  cube.archived = false;
  await putCube(cube);
  const code = getSyncCode();
  if (code) {
    try {
      await pushRestore(code, id);
    } catch (err) {
      console.warn("Failed to push restore to sync.", err);
    }
  }
}

// ---------- sessions ----------

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
  // Sessions are intentionally NOT synced — they reset between matches.
}

export async function resetSession(cubeId: string): Promise<void> {
  await idbClearSession(cubeId);
}

// ---------- inventories ----------

export async function loadInventory(cubeId: string): Promise<string[]> {
  const existing = await getInventory(cubeId);
  return existing ?? [];
}

export async function saveInventory(
  cubeId: string,
  ids: string[],
): Promise<void> {
  await putInventory(cubeId, ids);
  const code = getSyncCode();
  if (code) {
    try {
      await pushInventory(code, cubeId, ids);
    } catch (err) {
      console.warn("Failed to push inventory to sync.", err);
    }
  }
}

// ---------- helpers ----------

export function makeCubeId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${slug || "cube"}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Resolve a name conflict by appending " (2)", " (3)" etc. */
export async function uniqueCubeName(desired: string): Promise<string> {
  const all = await getAllCubes();
  const taken = new Set(all.map((c) => c.name));
  if (!taken.has(desired)) return desired;
  let i = 2;
  while (taken.has(`${desired} (${i})`)) i++;
  return `${desired} (${i})`;
}
