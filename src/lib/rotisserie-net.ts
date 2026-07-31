/**
 * Client for the networked (Phase 2) rotisserie draft. The server is
 * authoritative; this module is a thin fetch wrapper plus per-code
 * localStorage for "which seat am I" and "which draft am I in" so the tab can
 * resume after a reload. See docs/ROTISSERIE_DESIGN.md and api/draft.ts.
 */

import type { Cube } from "../types";
import type { RotisserieSeat } from "./rotisserie";

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // skip ambiguous i/l/o/0/1
const CODE_REGEX = /^[a-z0-9]{6,16}$/;

/** Fresh 8-char draft code (same alphanumeric shape the server validates). */
export function generateDraftCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/** Normalize + validate a user-entered code, or null if malformed. */
export function normalizeDraftCode(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  return CODE_REGEX.test(trimmed) ? trimmed : null;
}

export interface NetDraftMeta {
  cubeId: string;
  cubeName: string;
  cardCount: number;
  seats: RotisserieSeat[];
  cardsPerSeat: number;
  totalPicks: number;
  createdAt: string;
}

export interface NetDraftState {
  meta: NetDraftMeta;
  /** cardId (scryfall_id) -> seatId */
  claims: Record<string, string>;
  /** append-only "cardId:seatId:pickNo" */
  order: string[];
  cursor: number;
}

export interface PickResult {
  ok: boolean;
  /** On failure: "not_turn" | "claimed" | "complete" | a message. */
  error?: string;
  cursor?: number;
}

// ---------------------------------------------------------------------------

/** Create a new server draft at `code`. Throws on failure (incl. 409 exists). */
export async function createNetDraft(
  code: string,
  cube: Cube,
  seats: RotisserieSeat[],
  cardsPerSeat: number,
): Promise<void> {
  const res = await fetch(`/api/draft?code=${encodeURIComponent(code)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", cube, seats, cardsPerSeat }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      res.status === 409
        ? "A draft already exists at that code — pick a new one."
        : `Create failed: HTTP ${res.status} ${text}`,
    );
  }
}

/** Poll the lightweight draft snapshot. Returns null if the draft is gone (404). */
export async function fetchNetState(code: string): Promise<NetDraftState | null> {
  const res = await fetch(`/api/draft?code=${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`State fetch failed: HTTP ${res.status}`);
  return (await res.json()) as NetDraftState;
}

/** Fetch the draft's cube body (once, on join). */
export async function fetchNetCube(code: string): Promise<Cube> {
  const res = await fetch(
    `/api/draft?code=${encodeURIComponent(code)}&action=cube`,
  );
  if (!res.ok) throw new Error(`Cube fetch failed: HTTP ${res.status}`);
  return (await res.json()) as Cube;
}

/** Attempt a pick for `seatId`. Never throws on the expected 409 outcomes. */
export async function netPick(
  code: string,
  cardId: string,
  seatId: string,
): Promise<PickResult> {
  const res = await fetch(`/api/draft?code=${encodeURIComponent(code)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pick", cardId, seatId }),
  });
  const data = (await res.json().catch(() => ({}))) as PickResult;
  if (res.ok) return { ok: true, cursor: data.cursor };
  return { ok: false, error: data.error ?? `HTTP ${res.status}` };
}

/** Undo the most recent pick (trust-based; any participant may undo). */
export async function netUndo(code: string): Promise<void> {
  const res = await fetch(`/api/draft?code=${encodeURIComponent(code)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "undo" }),
  });
  if (!res.ok) throw new Error(`Undo failed: HTTP ${res.status}`);
}

// ---------- local identity / resume (per draft code) ----------

const SEAT_PREFIX = "booster-tutor-draft-seat:";
const ACTIVE_KEY = "booster-tutor-draft-active";

/** The seat this device is playing in a given draft (null = spectator/unset). */
export function getMySeat(code: string): string | null {
  try {
    return localStorage.getItem(SEAT_PREFIX + code);
  } catch {
    return null;
  }
}

export function setMySeat(code: string, seatId: string): void {
  try {
    localStorage.setItem(SEAT_PREFIX + code, seatId);
  } catch {
    // ignore
  }
}

/** The draft this tab should resume into, if any. */
export function getActiveDraft(): { code: string; seatId: string | null } | null {
  try {
    const code = localStorage.getItem(ACTIVE_KEY);
    if (!code) return null;
    return { code, seatId: getMySeat(code) };
  } catch {
    return null;
  }
}

export function setActiveDraft(code: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, code);
  } catch {
    // ignore
  }
}

export function clearActiveDraft(): void {
  try {
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // ignore
  }
}
