/**
 * Client-side cloud sync.
 *
 * Sync model:
 *   - User generates (or enters) a sync code; stored in localStorage.
 *   - On app boot: if a code is set, pull metadata + inventories. Fetch any
 *     missing cube bodies. Reconcile local IDB to match.
 *   - On change: write to local IDB (source of truth for the active device),
 *     fire-and-forget POST to /api/sync. Last write wins.
 *
 * KV holds: cube metadata, full cube bodies (one key per cube), and one
 * inventory array per cube. There is no permanent-delete API; archived
 * cubes are kept indefinitely.
 */

import type { Cube, CubeMetaEntry } from "../types";

const STORAGE_KEY_SYNC_CODE = "booster-tutor-sync-code";
const SYNC_CODE_REGEX = /^[a-z0-9]{6,16}$/;

export function getSyncCode(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SYNC_CODE);
    if (!raw) return null;
    const trimmed = raw.trim().toLowerCase();
    if (!SYNC_CODE_REGEX.test(trimmed)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function setSyncCode(code: string): string | null {
  const trimmed = code.trim().toLowerCase();
  if (!SYNC_CODE_REGEX.test(trimmed)) return null;
  localStorage.setItem(STORAGE_KEY_SYNC_CODE, trimmed);
  return trimmed;
}

export function clearSyncCode(): void {
  localStorage.removeItem(STORAGE_KEY_SYNC_CODE);
}

/** Generate a fresh 10-char alphanumeric sync code. */
export function generateSyncCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // skip ambiguous i/l/o/0/1
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// ---------------------------------------------------------------------------

interface SyncPullResponse {
  meta: { cubes: Record<string, CubeMetaEntry> };
  inventories: Record<string, string[]>;
}

export async function pullSync(code: string): Promise<SyncPullResponse> {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error(`Pull failed: HTTP ${res.status}`);
  return (await res.json()) as SyncPullResponse;
}

export async function fetchCube(code: string, id: string): Promise<Cube> {
  const res = await fetch(
    `/api/cube?code=${encodeURIComponent(code)}&id=${encodeURIComponent(id)}`,
  );
  if (!res.ok) throw new Error(`Fetch cube failed: HTTP ${res.status}`);
  return (await res.json()) as Cube;
}

async function postSync(
  code: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Push failed: HTTP ${res.status} ${text}`);
  }
}

export async function pushCube(code: string, cube: Cube): Promise<void> {
  await postSync(code, { action: "putCube", cube });
}

export async function pushArchive(code: string, id: string): Promise<void> {
  await postSync(code, { action: "archiveCube", id });
}

export async function pushRestore(code: string, id: string): Promise<void> {
  await postSync(code, { action: "restoreCube", id });
}

export async function pushInventory(
  code: string,
  cubeId: string,
  ids: string[],
): Promise<void> {
  await postSync(code, { action: "putInventory", cubeId, ids });
}
