/**
 * New versions: the person chooses when (Ari, 2026-11-16: "a banner ... so the
 * app doesn't refresh on them when they're using it").
 *
 * The service worker is registered in "prompt" mode (vite.config.ts): a new
 * deploy downloads in the background and waits. Nothing reloads by itself any
 * more (it used to reload the page the moment the new worker took over, mid
 * game or mid question). Instead the app shows UpdateBanner: "A new version is
 * ready · Update · Later". Only "Update" reloads into it. "Later" hides the
 * banner until the app is next opened. If nobody taps it, the waiting version
 * starts on its own the next time the app is opened fresh (every tab or window
 * of it closed), which is no reload at all.
 *
 * An app left open for days only learns about a deploy when it asks, so it
 * checks every hour while open and whenever it comes back on screen.
 *
 * Same pattern as Nan's Kitchen (src/lib/swUpdate.ts there).
 */
import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

export interface UpdateState {
  /** A new version has downloaded and is waiting. */
  waiting: boolean;
  /** "Later" was tapped: no banner until the app is next opened. */
  later: boolean;
  /** "Update" was tapped: the new version is taking over. */
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

let apply: (() => Promise<void>) | null = null;
let checkNow: (() => void) | null = null;
let soonTimer = 0;

/**
 * Look for a new version every 30 seconds for a while: a rebuild was just started from inside
 * the app (Check Cube Cobra), so the banner can turn up without leaving the app.
 */
export function watchForUpdate(forMs = 8 * 60 * 1000): void {
  if (!checkNow) return;
  window.clearInterval(soonTimer);
  const until = Date.now() + forMs;
  soonTimer = window.setInterval(() => {
    if (state.waiting || Date.now() > until) window.clearInterval(soonTimer);
    else checkNow?.();
  }, 30_000);
}

/** "Update": the waiting version takes over and the page reloads into it. */
export function applyUpdate(): void {
  if (!apply || state.updating) return;
  set({ updating: true });
  apply().catch(() => set({ updating: false }));
}

/** "Later": no banner until the app is next opened. */
export function updateLater(): void {
  set({ later: true });
}

const HOUR = 60 * 60 * 1000;

/** Register the service worker (once, from main.tsx). Does nothing where there isn't one (dev, old browsers). */
export function startUpdates(): void {
  if (!("serviceWorker" in navigator)) return;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      set({ waiting: true });
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine === false) return;
        registration.update().catch(() => {
          // Offline or the server hiccuped: the next check tries again.
        });
      };
      checkNow = check;
      window.setInterval(check, HOUR);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });
  // Skip waiting -> the new worker takes over -> the page reloads into the new version.
  apply = () => updateSW(true);
}

/** For tests: put the banner's state back. */
export function _setUpdateState(patch: Partial<UpdateState>): void {
  set(patch);
}
