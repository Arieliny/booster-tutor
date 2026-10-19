/**
 * Per-account sync for Cube review data (decisions, hand-added cards, printing
 * choices) and the deck randomizer's deck list - see api/userdata.ts for the
 * server half.
 *
 * The device stays the fast copy: every edit lands in localStorage instantly
 * and works offline. This engine runs alongside:
 *   - PUSH: ~1 s after a local change, send only what changed. Edits made
 *     offline wait in place and go up when the connection is back.
 *   - PULL: on start, every 15 s while the app is visible, on refocus and on
 *     reconnect, ask "anything new since rev N?" - a tiny request unless
 *     another device actually changed something.
 *   - MERGE: card by card, the newer edit wins (each entry carries its edit
 *     time `t`). A cleared decision / reset printing is a stamped entry too,
 *     so clearing syncs rather than resurrecting from the other device.
 *
 * Deliberately decoupled from lib/cube-review.ts (which carries ~750 KB of
 * card data): it works on the same localStorage keys and talks to it through
 * two window events, so starting sync never loads the cube data.
 */

const KEYS = {
  decisions: "booster-tutor-cube-review-decisions-v1",
  extras: "booster-tutor-cube-review-extras-v1",
  art: "booster-tutor-cube-review-art-v1",
  decks: "booster-tutor-decks-v1",
} as const;

/** Fired by lib/cube-review.ts whenever it saves something on this device. */
export const LOCAL_CHANGE_EVENT = "bt-userdata-local";
/** Fired by this engine after merging changes from another device. */
export const REMOTE_CHANGE_EVENT = "bt-userdata-remote";

const POLL_MS = 15_000;
const PUSH_DELAY_MS = 1_200;

type Stamped = { t: number } & Record<string, unknown>;
type StampedMap = Record<string, Stamped>;
type CardMap = Record<string, unknown>;

interface Meta {
  /** Server revision this device last caught up to (-1 = never). */
  rev: number;
  /** What the server is known to have, so only real changes get pushed. */
  pushed: { decisions: Record<string, number>; art: Record<string, number>; decks: Record<string, number>; extras: Record<string, 1> };
}

export type SyncState = "starting" | "synced" | "syncing" | "offline" | "error";
export interface SyncStatus {
  state: SyncState;
  /** Local changes not yet on the server. */
  pending: number;
  lastSynced: number | null;
  message?: string;
}

// ---------------------------------------------------------------- status store

let status: SyncStatus = { state: "starting", pending: 0, lastSynced: null };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
export function subscribeSyncStatus(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function getSyncStatus(): SyncStatus {
  return status;
}

// ---------------------------------------------------------------- storage

function read<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked/full: the server copy still has it.
  }
}

const metaKey = (userId: string) => `booster-tutor-sync-${userId}`;

function loadMeta(userId: string): Meta {
  const m = read<Partial<Meta> | null>(metaKey(userId), null);
  return {
    rev: typeof m?.rev === "number" ? m.rev : -1,
    pushed: {
      decisions: m?.pushed?.decisions ?? {},
      art: m?.pushed?.art ?? {},
      decks: m?.pushed?.decks ?? {},
      extras: m?.pushed?.extras ?? {},
    },
  };
}

/** Everything on this device that the server doesn't have yet. */
function pendingChanges(meta: Meta) {
  const pick = (map: StampedMap, sent: Record<string, number>) =>
    Object.fromEntries(Object.entries(map).filter(([id, v]) => v && typeof v.t === "number" && sent[id] !== v.t));
  const decisions = pick(read<StampedMap>(KEYS.decisions, {}), meta.pushed.decisions);
  const art = pick(read<StampedMap>(KEYS.art, {}), meta.pushed.art);
  const decks = pick(read<StampedMap>(KEYS.decks, {}), meta.pushed.decks);
  const extras = Object.fromEntries(
    Object.entries(read<CardMap>(KEYS.extras, {})).filter(([id]) => !meta.pushed.extras[id]),
  );
  const count = Object.keys(decisions).length + Object.keys(art).length + Object.keys(decks).length + Object.keys(extras).length;
  return { decisions, art, decks, extras, count };
}

/** Newer edit wins, per entry. Returns whether anything local changed. */
function mergeStamped(key: string, remote: StampedMap, sent: Record<string, number>): boolean {
  const local = read<StampedMap>(key, {});
  let changed = false;
  for (const [id, r] of Object.entries(remote)) {
    if (!r || typeof r.t !== "number") continue;
    const l = local[id];
    if (!l || r.t > l.t) {
      local[id] = r;
      changed = true;
    }
    // The server holds r; if ours is newer it stays pending until pushed.
    if (!l || r.t >= l.t) sent[id] = r.t;
  }
  if (changed) write(key, local);
  return changed;
}

// ---------------------------------------------------------------- engine

class AuthEnded extends Error {}

async function api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (res.status === 401) throw new AuthEnded();
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) {
    throw new Error(`Sync failed (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

/**
 * Start syncing this account's Cube review data. Returns a stop function.
 * Safe to call once per signed-in session (App does, for the owner).
 */
export function startUserSync(userId: string): () => void {
  const meta = loadMeta(userId);
  let stopped = false;
  let running = false;
  let again = false;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;

  const saveMeta = () => write(metaKey(userId), meta);

  async function push() {
    const p = pendingChanges(meta);
    setStatus({ pending: p.count });
    if (!p.count) return;
    const sent = { decisions: p.decisions, art: p.art, decks: p.decks, extras: p.extras };
    const res = await api<{ rev: number; applied: number }>("POST", "/api/userdata", sent);
    for (const [id, v] of Object.entries(p.decisions)) meta.pushed.decisions[id] = (v as Stamped).t;
    for (const [id, v] of Object.entries(p.art)) meta.pushed.art[id] = (v as Stamped).t;
    for (const [id, v] of Object.entries(p.decks)) meta.pushed.decks[id] = (v as Stamped).t;
    for (const id of Object.keys(p.extras)) meta.pushed.extras[id] = 1;
    // If nobody else wrote in between, we're already at the server's revision.
    if (res.rev === meta.rev + (res.applied ? 1 : 0)) meta.rev = res.rev;
    saveMeta();
  }

  async function pull() {
    const res = await api<{
      rev: number;
      unchanged?: boolean;
      decisions?: StampedMap;
      art?: StampedMap;
      decks?: StampedMap;
      extras?: CardMap;
    }>("GET", `/api/userdata?since=${meta.rev}`);
    if (res.unchanged) return;
    let changed = false;
    changed = mergeStamped(KEYS.decisions, res.decisions ?? {}, meta.pushed.decisions) || changed;
    changed = mergeStamped(KEYS.art, res.art ?? {}, meta.pushed.art) || changed;
    changed = mergeStamped(KEYS.decks, res.decks ?? {}, meta.pushed.decks) || changed;
    const localExtras = read<CardMap>(KEYS.extras, {});
    let extrasChanged = false;
    for (const [id, c] of Object.entries(res.extras ?? {})) {
      if (!localExtras[id]) {
        localExtras[id] = c;
        extrasChanged = true;
      }
      meta.pushed.extras[id] = 1;
    }
    if (extrasChanged) write(KEYS.extras, localExtras);
    meta.rev = res.rev;
    saveMeta();
    if (changed || extrasChanged) window.dispatchEvent(new Event(REMOTE_CHANGE_EVENT));
  }

  async function run() {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    setStatus({ state: "syncing" });
    try {
      do {
        again = false;
        await push();
        await pull();
        await push(); // anything that only became "ours to send" after the merge
      } while (again && !stopped);
      setStatus({ state: "synced", lastSynced: Date.now(), pending: pendingChanges(meta).count, message: undefined });
    } catch (err) {
      if (err instanceof AuthEnded) {
        stopped = true;
        setStatus({ state: "error", message: "Signed out - sign in again to sync." });
      } else if (!navigator.onLine || err instanceof TypeError) {
        setStatus({ state: "offline", pending: pendingChanges(meta).count, message: undefined });
      } else {
        setStatus({ state: "error", pending: pendingChanges(meta).count, message: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      running = false;
    }
  }

  const onLocal = () => {
    setStatus({ pending: pendingChanges(meta).count });
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void run(), PUSH_DELAY_MS);
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void run();
  };
  const onOnline = () => void run();

  window.addEventListener(LOCAL_CHANGE_EVENT, onLocal);
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  const poll = setInterval(() => {
    if (document.visibilityState === "visible") void run();
  }, POLL_MS);
  void run();

  return () => {
    stopped = true;
    if (pushTimer) clearTimeout(pushTimer);
    clearInterval(poll);
    window.removeEventListener(LOCAL_CHANGE_EVENT, onLocal);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
