/**
 * Shared-library sync.
 *
 * This app has one shared cube library, not per-user data:
 *   - Everyone who opens the site reads the same cubes (no code, no setup).
 *   - Local IndexedDB stays the fast read path / offline cache; the server is
 *     the shared copy that survives a cleared browser.
 *   - WRITES (adding, refreshing, renaming, archiving cubes, inventory) require
 *     an edit PIN, checked server-side in api/sync.ts against the EDIT_PIN env
 *     var (with per-IP rate limiting). Reads are open to anyone.
 *
 * Drafting state (picked cards, rotisserie hotseat) is deliberately NOT synced,
 * so a visitor can open packs and draft freely without touching the library.
 *
 * The PIN is a shared secret typed by the owner, kept in localStorage and sent
 * on write requests. It is not an account system — it exists to stop a casual
 * visitor from wrecking the cube list. Because a short PIN is easy to guess,
 * the server rate-limits wrong attempts per IP (see api/sync.ts).
 */

import type { Cube, CubeMetaEntry } from "../types";

/**
 * Fixed namespace for the shared library. Must satisfy the server's
 * /^[a-z0-9]{6,16}$/ check. Changing this starts a brand new empty library.
 */
const SHARED_NAMESPACE = "boostertutor";

const STORAGE_KEY_EDIT_PIN = "booster-tutor-edit-pin";

/** Header carrying the edit PIN on write requests. */
const EDIT_HEADER = "x-edit-key";

/** Thrown when a write is rejected because the edit PIN is missing/wrong. */
export class NotAuthorizedError extends Error {
  constructor(message = "Editing is locked. Enter the edit PIN to make changes.") {
    super(message);
    this.name = "NotAuthorizedError";
  }
}

/** Thrown when the server has temporarily locked out further PIN attempts. */
export class RateLimitedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitedError";
  }
}

/** The namespace every client reads and writes. Constant by design. */
export function getSyncCode(): string {
  return SHARED_NAMESPACE;
}

// ---------- edit PIN (local only) ----------

export function getEditPin(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EDIT_PIN);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function setEditPin(pin: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_EDIT_PIN, pin);
  } catch {
    // Non-fatal: the user just re-enters it next session.
  }
}

export function clearEditPin(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_EDIT_PIN);
  } catch {
    // ignore
  }
}

/** True when this browser holds an edit PIN (not proof that it's right). */
export function hasEditPin(): boolean {
  return getEditPin() !== null;
}

/**
 * Ask the server whether a PIN is valid. Returns true and stores it on
 * success; never stores a rejected PIN. Throws RateLimitedError if the server
 * has temporarily locked out attempts.
 */
export async function verifyEditPin(pin: string): Promise<boolean> {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(SHARED_NAMESPACE)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [EDIT_HEADER]: pin },
    body: JSON.stringify({ action: "verify" }),
  });
  if (res.status === 401) return false;
  if (res.status === 429) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new RateLimitedError(
      data?.error ?? "Too many incorrect PIN attempts. Try again later.",
    );
  }
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
  setEditPin(pin);
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
  const pin = getEditPin();
  if (!pin) throw new NotAuthorizedError();

  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [EDIT_HEADER]: pin },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new NotAuthorizedError(
      "That edit PIN was rejected. Re-enter it to make changes.",
    );
  }
  if (res.status === 429) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new RateLimitedError(
      data?.error ?? "Too many incorrect PIN attempts. Try again later.",
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
