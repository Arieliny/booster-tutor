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

export type Tab = "packs" | "inventory" | "review" | "reviewPrint" | "cubeReview" | "lookup" | "judge" | "admin";

export const TAB_PATHS: Record<Tab, string> = {
  packs: "/",
  inventory: "/inventory",
  review: "/set-review",
  // Not a top-level tab — a condensed, printable view of the set review.
  reviewPrint: "/set-review/print",
  // Owner only, reached from the account menu rather than the nav.
  admin: "/admin",
  // My cube's lists live under it: /my-cube/changelog etc. (see CubeReview).
  cubeReview: "/my-cube",
  lookup: "/look-up",
  judge: "/judge",
};

/** Paths from before the redesign, so old bookmarks still land. */
const OLD_PATHS: Record<string, Tab> = {
  "/cube-review": "cubeReview",
};

const PATH_TABS = new Map<string, Tab>([
  ...(Object.entries(TAB_PATHS) as [Tab, string][]).map(([tab, path]) => [path, tab] as [string, Tab]),
  ...(Object.entries(OLD_PATHS) as [string, Tab][]),
]);

/** Paths with pages under them (/my-cube/changelog -> My cube). */
const NESTED: [string, Tab][] = [["/my-cube/", "cubeReview"]];

/** Normalize "/Set-Review/" -> "/set-review". */
function normalize(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "").toLowerCase();
  return trimmed === "" ? "/" : trimmed;
}

/** The tab a path maps to; unknown paths fall back to the default tab. */
export function tabFromPath(pathname: string): Tab {
  const p = normalize(pathname);
  return PATH_TABS.get(p) ?? NESTED.find(([prefix]) => p.startsWith(prefix))?.[1] ?? "packs";
}

/** True when the path isn't one we recognize (so the URL can be tidied up). */
export function isKnownPath(pathname: string): boolean {
  const p = normalize(pathname);
  return PATH_TABS.has(p) || NESTED.some(([prefix]) => p.startsWith(prefix));
}

/** Whether the current URL already shows this tab (possibly a page inside it). */
export function pathShowsTab(pathname: string, tab: Tab): boolean {
  const p = normalize(pathname);
  return p === TAB_PATHS[tab] || (isKnownPath(p) && tabFromPath(p) === tab && !(p in OLD_PATHS));
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

// ---------------------------------------------------------------- jumping between screens

const NAVIGATE_EVENT = "bt-navigate";

/** Open another screen from deep inside one (e.g. "Ask the judge" in a card popup). */
export function navigateTo(tab: Tab): void {
  window.dispatchEvent(new CustomEvent<Tab>(NAVIGATE_EVENT, { detail: tab }));
}

/** App listens here; returns the unsubscribe. */
export function onNavigate(fn: (tab: Tab) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<Tab>).detail);
  window.addEventListener(NAVIGATE_EVENT, handler);
  return () => window.removeEventListener(NAVIGATE_EVENT, handler);
}

// ---------------------------------------------------------------- nav sections

export type Section = "play" | "myCube" | "lookup" | "judge" | "grades";

/**
 * The nav, in order. Each section holds one or more screens; the first one
 * this person may open is where tapping the section goes. Admin lives in the
 * account menu instead.
 */
export const SECTIONS: { id: Section; label: string; tabs: Tab[] }[] = [
  { id: "play", label: "Play", tabs: ["packs"] },
  // The collection checklist (Inventory) opens from My cube's home page.
  { id: "myCube", label: "My cube", tabs: ["cubeReview", "inventory"] },
  { id: "lookup", label: "Look up", tabs: ["lookup"] },
  { id: "judge", label: "Judge", tabs: ["judge"] },
  { id: "grades", label: "Set grades", tabs: ["review", "reviewPrint"] },
];

export function sectionOf(tab: Tab): Section | null {
  return SECTIONS.find((s) => s.tabs.includes(tab))?.id ?? null;
}

/** Page title for the top bar. */
export const TAB_TITLES: Record<Tab, string> = {
  packs: "Play",
  inventory: "My cube",
  cubeReview: "My cube",
  lookup: "Look up",
  judge: "Judge",
  review: "Set grades",
  reviewPrint: "Set grades",
  admin: "People and access",
};

/** Tabs that act on the selected cube, so only they show the cube picker. */
export function tabUsesCube(tab: Tab): boolean {
  return tab === "packs" || tab === "inventory";
}

// ---------------------------------------------------------------- who sees what

/**
 * What each person may open. The owner gets everything; a guest gets only the
 * features the owner granted (Play -> packs, Set grades -> the set review).
 * My cube (with its checklist), Look up and Admin are the owner's alone for now.
 */
export function tabAllowed(tab: Tab, me: Me): boolean {
  if (me.role === "owner") return true;
  if (tab === "packs") return can(me, "play");
  if (tab === "review" || tab === "reviewPrint") return can(me, "setReview");
  if (tab === "judge") return can(me, "judge");
  return false;
}

/** The nav sections this person sees, each pointing at its first allowed screen. */
export function allowedSections(me: Me): { id: Section; label: string; tab: Tab }[] {
  return SECTIONS.flatMap((s) => {
    const tab = s.tabs.find((t) => t !== "reviewPrint" && t !== "inventory" && tabAllowed(t, me));
    return tab ? [{ id: s.id, label: s.label, tab }] : [];
  });
}
