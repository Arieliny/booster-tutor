/**
 * Shared-library sync.
 *
 * This app has one shared cube library, not per-user data:
 *   - Local IndexedDB stays the fast read path / offline cache; the server is
 *     the shared copy that survives a cleared browser.
 *   - Reading it needs a signed-in user who can use Play; every WRITE (adding,
 *     refreshing, renaming, archiving cubes, inventory) needs the owner. Both
 *     are enforced server-side from the session cookie (see api/_auth.ts),
 *     which the browser sends automatically on these same-origin requests.
 *
 * Drafting state (picked cards) is deliberately NOT synced.
 */

import type { Cube, CubeMetaEntry } from "../types";

/**
 * Fixed namespace for the shared library. Must satisfy the server's
 * /^[a-z0-9]{6,16}$/ check. Changing this starts a brand new empty library.
 */
const SHARED_NAMESPACE = "boostertutor";

/** Thrown when a write is rejected because this person isn't the owner (or is signed out). */
export class NotAuthorizedError extends Error {
  constructor(message = "Only the owner can change cubes.") {
    super(message);
    this.name = "NotAuthorizedError";
  }
}

/** The namespace every client reads and writes. Constant by design. */
export function getSyncCode(): string {
  return SHARED_NAMESPACE;
}

// ---------------------------------------------------------------------------

interface SyncPullResponse {
  meta: { cubes: Record<string, CubeMetaEntry> };
  inventories: Record<string, string[]>;
}

export async function pullSync(code: string): Promise<SyncPullResponse> {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error(`Pull failed: HTTP ${res.status}`);
  // Under `npm run dev` there's no serverless runtime, and Vite happily serves
  // the api/*.ts source at this path. Fail with something readable instead of
  // a JSON parse error on TypeScript.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "/api/sync did not return JSON — the serverless API isn't running (expected under local `npm run dev`; sync works on the deployed site).",
    );
  }
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

  if (res.status === 401) {
    throw new NotAuthorizedError("You've been signed out. Sign in again to make changes.");
  }
  if (res.status === 403) throw new NotAuthorizedError();
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
