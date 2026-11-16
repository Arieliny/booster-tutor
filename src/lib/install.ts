import { useSyncExternalStore } from "react";

/**
 * "Add to home screen" support. Chrome on Android fires `beforeinstallprompt`
 * once, early, and only lets us show its sheet if we kept the event, so the
 * listener is attached the moment this module loads. iPhone Safari has no such
 * event; there we can only tell people where the Share button is.
 */

const DISMISS_KEY = "booster-tutor-install-dismissed-v1";
/** "Not now" hides the card this long, so it never nags. */
export const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

export type InstallState = { canInstall: boolean; installed: boolean; isIos: boolean; dismissed: boolean };

// The one-shot event Chrome gave us (typed loosely; it is not in lib.dom).
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let saved: InstallEvent | null = null;
let installedByEvent = false;
// Remembered in memory too, so "Not now" works even if storage is blocked.
let dismissedThisVisit = false;
let snapshot: InstallState | null = null;
const listeners = new Set<() => void>();

/** True when a stored "Not now" timestamp is still inside the 30-day window. */
export function isDismissedAt(raw: string | null, now: number): boolean {
  if (!raw) return false;
  const at = Number(raw);
  // A timestamp from the future (clock changes) must not hide the card forever.
  return Number.isFinite(at) && at <= now && now - at < DISMISS_MS;
}

function readDismissed(): boolean {
  if (dismissedThisVisit) return true;
  try {
    return isDismissedAt(localStorage.getItem(DISMISS_KEY), Date.now());
  } catch {
    return false;
  }
}

function runningAsApp(): boolean {
  if (installedByEvent) return true;
  try {
    const mm = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : null;
    if (mm && (mm("(display-mode: standalone)").matches || mm("(display-mode: fullscreen)").matches)) return true;
    return typeof navigator !== "undefined" && (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** iPhone/iPad (iPadOS 13+ calls itself a Mac but has a touch screen). */
function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

function compute(): InstallState {
  return { canInstall: saved !== null, installed: runningAsApp(), isIos: detectIos(), dismissed: readDismissed() };
}

function emit() {
  snapshot = null;
  for (const l of listeners) l();
}

/** Attach the listeners. Safe to call twice and where there is no window. */
let watching = false;
export function startInstallWatch(): void {
  if (watching || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  watching = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // stop Chrome's own mini-bar; we offer our own button
    saved = e as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installedByEvent = true;
    saved = null;
    emit();
  });
}

startInstallWatch();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// useSyncExternalStore needs the same object back until something changes.
function getSnapshot(): InstallState {
  return (snapshot ??= compute());
}

const SERVER_STATE: InstallState = { canInstall: false, installed: false, isIos: false, dismissed: false };

export function useInstall(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
}

/** Show Chrome's install sheet. The saved event works once, so it is dropped after. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const ev = saved;
  if (!ev) return "unavailable";
  saved = null;
  emit();
  try {
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    return outcome;
  } catch {
    return "unavailable";
  }
}

/** "Not now": hide the card for 30 days. */
export function dismissInstall(): void {
  dismissedThisVisit = true;
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // storage blocked: the in-memory flag still hides it for this visit
  }
  emit();
}
