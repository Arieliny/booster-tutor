/**
 * Tiny path router.
 *
 * Each tab gets a real URL so they can be linked and bookmarked
 * (booster-tutor.vercel.app/set-review). Deliberately hand-rolled rather than
 * pulling in a router: there are four static routes, no params and no nesting.
 *
 * Deep links need two other pieces to work:
 *   - vercel.json rewrites unknown paths to index.html (excluding /api)
 *   - the service worker's navigateFallback does the same offline
 */

import { can, type Me } from "./auth";

export type Tab = "packs" | "inventory" | "review" | "reviewPrint" | "cubeReview" | "admin";

export const TAB_PATHS: Record<Tab, string> = {
  packs: "/",
  inventory: "/inventory",
  review: "/set-review",
  // Not a top-level tab — a condensed, printable view of the set review.
  reviewPrint: "/set-review/print",
  // Owner only, reached from the account menu rather than the tab bar.
  admin: "/admin",
  cubeReview: "/cube-review",
};

const PATH_TABS = new Map<string, Tab>(
  (Object.entries(TAB_PATHS) as [Tab, string][]).map(([tab, path]) => [path, tab]),
);

/** Normalize "/Set-Review/" -> "/set-review". */
function normalize(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "").toLowerCase();
  return trimmed === "" ? "/" : trimmed;
}

/** The tab a path maps to; unknown paths fall back to the default tab. */
export function tabFromPath(pathname: string): Tab {
  return PATH_TABS.get(normalize(pathname)) ?? "packs";
}

/** True when the path isn't one we recognize (so the URL can be tidied up). */
export function isKnownPath(pathname: string): boolean {
  return PATH_TABS.has(normalize(pathname));
}

export function pathForTab(tab: Tab): string {
  return TAB_PATHS[tab];
}

// ---------------------------------------------------------------- last tab

const LAST_TAB_KEY = "booster-tutor-last-tab";

/** Remember the mode in use, so the app reopens on it. */
export function rememberTab(tab: Tab): void {
  // Admin is a place you visit, not a mode to reopen the app in.
  if (tab === "admin") return;
  try {
    // The print view is a sub-page; reopening on it would be odd.
    localStorage.setItem(LAST_TAB_KEY, tab === "reviewPrint" ? "review" : tab);
  } catch {
    // Private mode / blocked storage: just open on the default tab next time.
  }
}

function rememberedTab(): Tab | null {
  try {
    const t = localStorage.getItem(LAST_TAB_KEY);
    return t && t in TAB_PATHS ? (t as Tab) : null;
  } catch {
    return null;
  }
}

/**
 * The tab to open on. A bare "/" (which is how the installed app's home-screen
 * icon launches) resumes the last mode used; any other path is an explicit
 * link, so it wins.
 */
export function initialTab(pathname: string): Tab {
  if (normalize(pathname) === "/") return rememberedTab() ?? "packs";
  return tabFromPath(pathname);
}

/** Tabs that act on the selected cube, so only they show the cube picker. */
export function tabUsesCube(tab: Tab): boolean {
  return tab === "packs" || tab === "inventory";
}

// ---------------------------------------------------------------- who sees what

/** The tab bar, in order. Admin lives in the account menu instead. */
export const NAV_TABS: { id: Tab; label: string }[] = [
  { id: "packs", label: "Open packs" },
  { id: "cubeReview", label: "Cube review" },
  { id: "review", label: "Set review" },
  { id: "inventory", label: "Inventory" },
];

/**
 * What each person may open. The owner gets everything; a guest gets only the
 * features the owner granted (Play -> Open packs, Set grades -> Set review).
 * Cube review, Inventory and Admin are the owner's alone.
 */
export function tabAllowed(tab: Tab, me: Me): boolean {
  if (me.role === "owner") return true;
  if (tab === "packs") return can(me, "play");
  if (tab === "review" || tab === "reviewPrint") return can(me, "setReview");
  return false;
}
