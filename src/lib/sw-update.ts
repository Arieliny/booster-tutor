/**
 * New versions: only when the person taps Update (Ari, 2026-11-16: "a banner ... so the app
 * doesn't refresh on them when they're using it"; 2026-11-18: "I don't want the app to update
 * on its own - I only want it to update when I tap the Update button").
 *
 * Browsers install a new service worker by themselves when they see a deploy, and a waiting
 * one takes over on its own once every window of the app is closed. So the service worker
 * carries a gate (public/sw-gate.js): a new version refuses to install until this page
 * approves it. The page finds new versions itself, by comparing /version.json (written by
 * every build, vite.config.ts) with the version it is running (lib/build-info.ts), and shows
 * UpdateBanner: "A new version is ready · Later · Update".
 *
 *  - Update: write the approval, ask the browser to fetch the new worker, and when it has
 *    installed, let it take over and reload into it.
 *  - Later: no banner until the app is next opened. Nothing changes on its own.
 *
 * An app left open for days learns about a deploy by checking every hour while open and
 * whenever it comes back on screen.
 */
import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";
import { BUILT_AT } from "./build-info";

export interface UpdateState {
  /** A newer version is out (on the server, or already installed and waiting). */
  waiting: boolean;
  /** "Later" was tapped: no banner until the app is next opened. */
  later: boolean;
  /** "Update" was tapped: the new version is installing and taking over. */
  updating: boolean;
}

let state: UpdateState = { waiting: false, later: false, updating: false };
const listeners = new Set<() => void>();
function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Must match public/sw-gate.js. */
const APPROVAL_CACHE = "update-approval";
const HOUR = 60 * 60 * 1000;

let registration: ServiceWorkerRegistration | null = null;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let soonTimer = 0;

/** Is a newer build on the server than the one running? */
async function checkForUpdate(): Promise<void> {
  if (!BUILT_AT || state.waiting || navigator.onLine === false) return;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const { builtAt } = (await res.json()) as { builtAt?: unknown };
    if (typeof builtAt === "string" && builtAt > BUILT_AT) set({ waiting: true });
  } catch {
    // Offline, or the server hiccuped (or dev, with no version.json): the next check tries again.
  }
}

/**
 * Look for a new version every 30 seconds for a while: a rebuild was just started from inside
 * the app (Check Cube Cobra), so the banner can turn up without leaving the app.
 */
export function watchForUpdate(forMs = 8 * 60 * 1000): void {
  window.clearInterval(soonTimer);
  const until = Date.now() + forMs;
  soonTimer = window.setInterval(() => {
    if (state.waiting || Date.now() > until) window.clearInterval(soonTimer);
    else void checkForUpdate();
  }, 30_000);
}

/** "Update": approve the new version, let it install, and reload into it. */
export function applyUpdate(): void {
  if (state.updating) return;
  set({ updating: true });
  void (async () => {
    try {
      const reg = registration;
      if (!reg || !updateSW) {
        // No service worker here (an old browser, or it never registered): a reload is the update.
        window.location.reload();
        return;
      }
      if (reg.waiting) {
        await updateSW(true);
        return;
      }
      const approvals = await caches.open(APPROVAL_CACHE);
      await approvals.put("/approved", new Response(String(Date.now())));
      // onNeedRefresh (below) takes it from here once the new worker has installed.
      await reg.update();
      // Nothing new to install after all (the server matched this version): just reload.
      window.setTimeout(() => {
        if (!reg.installing && !reg.waiting) window.location.reload();
      }, 5_000);
      // Stuck (a very slow download): reload anyway rather than leave "Updating…" forever.
      window.setTimeout(() => window.location.reload(), 90_000);
    } catch {
      set({ updating: false });
    }
  })();
}

/** "Later": no banner until the app is next opened. */
export function updateLater(): void {
  set({ later: true });
}

/** Register the service worker and start checking for new versions (once, from main.tsx). */
export function startUpdates(): void {
  if (!("serviceWorker" in navigator)) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // A new worker has installed and is waiting: approved by Update (take over now), or one
      // from before the gate existed (show the banner).
      if (state.updating) void updateSW?.(true);
      else set({ waiting: true });
    },
    onRegisteredSW(_url, reg) {
      registration = reg ?? null;
    },
  });
  void checkForUpdate();
  window.setInterval(() => void checkForUpdate(), HOUR);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForUpdate();
  });
}

/** For tests: put the banner's state back. */
export function _setUpdateState(patch: Partial<UpdateState>): void {
  set(patch);
}
