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

export type Tab = "packs" | "rotisserie" | "inventory" | "review" | "reviewPrint";

export const TAB_PATHS: Record<Tab, string> = {
  packs: "/",
  rotisserie: "/rotisserie",
  inventory: "/inventory",
  review: "/set-review",
  // Not a top-level tab — a condensed, printable view of the set review.
  reviewPrint: "/set-review/print",
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
