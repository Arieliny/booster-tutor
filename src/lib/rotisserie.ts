/**
 * Rotisserie draft — local hotseat (pass-and-play) logic + persistence.
 *
 * Phase 1: everything lives on one device in React state, mirrored to
 * localStorage per cube so a refresh doesn't lose an in-progress draft. There
 * is no server and no concurrency here — a networked, server-authoritative
 * version is Phase 2 (see docs/ROTISSERIE_DESIGN.md).
 *
 * Rotisserie rules: one shared finite pool (the whole cube), players draft in
 * snake order (1→N, then N→1, repeating), one card per turn, every pick public
 * and permanent.
 */

export interface RotisserieSeat {
  id: string;
  name: string;
}

export interface RotisseriePick {
  /** scryfall_id of the claimed card. */
  cardId: string;
  seatId: string;
  /** 0-indexed pick number in draft order. */
  pickNo: number;
}

export interface RotisserieState {
  cubeId: string;
  seats: RotisserieSeat[];
  /** Target cards per seat; draft ends when every seat has this many (or the pool runs dry). */
  cardsPerSeat: number;
  /** Append-only, in pick order. */
  picks: RotisseriePick[];
  createdAt: string;
}

export const MIN_SEATS = 2;
export const MAX_SEATS = 8;
export const DEFAULT_CARDS_PER_SEAT = 45;

/**
 * Snake seat index for a given 0-indexed pick number.
 * Even rounds go 0→N-1, odd rounds reverse N-1→0.
 */
export function seatIndexForPick(pickNo: number, numSeats: number): number {
  const round = Math.floor(pickNo / numSeats);
  const pos = pickNo % numSeats;
  return round % 2 === 0 ? pos : numSeats - 1 - pos;
}

/** Total picks the draft runs for, capped by the cube size. */
export function totalPicks(state: RotisserieState, cubeSize: number): number {
  return Math.min(state.cardsPerSeat * state.seats.length, cubeSize);
}

export function isComplete(state: RotisserieState, cubeSize: number): boolean {
  return state.picks.length >= totalPicks(state, cubeSize);
}

/** The seat whose turn it is, or null when the draft is complete. */
export function currentSeat(
  state: RotisserieState,
  cubeSize: number,
): RotisserieSeat | null {
  if (isComplete(state, cubeSize)) return null;
  const idx = seatIndexForPick(state.picks.length, state.seats.length);
  return state.seats[idx] ?? null;
}

/** Map of cardId → seatId for every claimed card. */
export function claimedMap(state: RotisserieState): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of state.picks) m.set(p.cardId, p.seatId);
  return m;
}

/** Picks belonging to one seat, in pick order. */
export function picksForSeat(
  state: RotisserieState,
  seatId: string,
): RotisseriePick[] {
  return state.picks.filter((p) => p.seatId === seatId);
}

function makeSeatId(index: number): string {
  return `seat-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createDraft(
  cubeId: string,
  seatNames: string[],
  cardsPerSeat: number,
): RotisserieState {
  const seats: RotisserieSeat[] = seatNames.map((raw, i) => ({
    id: makeSeatId(i),
    name: raw.trim() || `Player ${i + 1}`,
  }));
  return {
    cubeId,
    seats,
    cardsPerSeat,
    picks: [],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Claim a card for whoever's turn it is. Returns a NEW state. No-op (returns the
 * same reference) if the draft is complete or the card is already claimed —
 * callers should gate on currentSeat/claimedMap, this is just a safety net.
 */
export function claim(
  state: RotisserieState,
  cardId: string,
  cubeSize: number,
): RotisserieState {
  const seat = currentSeat(state, cubeSize);
  if (!seat) return state;
  if (state.picks.some((p) => p.cardId === cardId)) return state;
  return {
    ...state,
    picks: [
      ...state.picks,
      { cardId, seatId: seat.id, pickNo: state.picks.length },
    ],
  };
}

/** Undo the most recent pick. Returns a NEW state (or the same if empty). */
export function undoLast(state: RotisserieState): RotisserieState {
  if (state.picks.length === 0) return state;
  return { ...state, picks: state.picks.slice(0, -1) };
}

// ---------- persistence (localStorage, per cube) ----------

const KEY_PREFIX = "booster-tutor-rotisserie:";

function keyFor(cubeId: string): string {
  return `${KEY_PREFIX}${cubeId}`;
}

export function loadDraft(cubeId: string): RotisserieState | null {
  try {
    const raw = localStorage.getItem(keyFor(cubeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RotisserieState;
    if (
      !parsed ||
      parsed.cubeId !== cubeId ||
      !Array.isArray(parsed.seats) ||
      !Array.isArray(parsed.picks)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(state: RotisserieState): void {
  try {
    localStorage.setItem(keyFor(state.cubeId), JSON.stringify(state));
  } catch {
    // Best-effort; a full quota just means no resume-after-refresh.
  }
}

export function clearDraft(cubeId: string): void {
  try {
    localStorage.removeItem(keyFor(cubeId));
  } catch {
    // ignore
  }
}
