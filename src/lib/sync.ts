/**
 * Shared-library sync.
 *
 * This app has one shared cube library, not per-user data:
 *   - Everyone who opens the site reads the same cubes (no code, no setup).
 *   - Local IndexedDB stays the fast read path / offline cache; the server is
 *     the shared copy that survives a cleared browser.
 *   - WRITES (adding, refreshing, renaming, archiving cubes, inventory) require
 *     an edit password, checked server-side in api/sync.ts against the
 *     EDIT_PASSWORD env var. Reads are open to anyone.
 *
 * Drafting state (picked cards, rotisserie hotseat) is deliberately NOT synced,
 * so a visitor can open packs and draft freely without touching the library.
 *
 * The password is a shared secret typed by the owner, kept in localStorage and
 * sent on write requests. It is not an account system — it exists to stop a
 * casual visitor from wrecking the cube list.
 */

import type { Cube, CubeMetaEntry } from "../types";

/**
 * Fixed namespace for the shared library. Must satisfy the server's
 * /^[a-z0-9]{6,16}$/ check. Changing this starts a brand new empty library.
 */
const SHARED_NAMESPACE = "boostertutor";

const STORAGE_KEY_EDIT_PASSWORD = "booster-tutor-edit-key";

/** Header carrying the edit password on write requests. */
const EDIT_HEADER = "x-edit-key";

/** Thrown when a write is rejected because the edit password is missing/wrong. */
export class NotAuthorizedError extends Error {
  constructor(message = "Editing is locked. Enter the edit password to make changes.") {
    super(message);
    this.name = "NotAuthorizedError";
  }
}

/** The namespace every client reads and writes. Constant by design. */
export function getSyncCode(): string {
  return SHARED_NAMESPACE;
}

// ---------- edit password (local only) ----------

export function getEditPassword(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EDIT_PASSWORD);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function setEditPassword(password: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_EDIT_PASSWORD, password);
  } catch {
    // Non-fatal: the user just re-enters it next session.
  }
}

export function clearEditPassword(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_EDIT_PASSWORD);
  } catch {
    // ignore
  }
}

/** True when this browser holds an edit password (not proof that it's right). */
export function hasEditPassword(): boolean {
  return getEditPassword() !== null;
}

/**
 * Ask the server whether a password is valid. Returns true and stores it on
 * success; never stores a rejected password.
 */
export async function verifyEditPassword(password: string): Promise<boolean> {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(SHARED_NAMESPACE)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [EDIT_HEADER]: password },
    body: JSON.stringify({ action: "verify" }),
  });
  if (res.status === 401) return false;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Couldn't check the password: HTTP ${res.status} ${text}`);
  }
  // Insist on a real JSON ack. A 200 that isn't our API (e.g. an SPA fallback
  // serving index.html) must not be mistaken for a successful unlock.
  const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
  if (!data || data.ok !== true) {
    throw new Error(
      "Unexpected response from the server — is the API deployed?",
    );
  }
  setEditPassword(password);
  return true;
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
  const password = getEditPassword();
  if (!password) throw new NotAuthorizedError();

  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [EDIT_HEADER]: password },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new NotAuthorizedError(
      "That edit password was rejected. Re-enter it to make changes.",
    );
  }
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
