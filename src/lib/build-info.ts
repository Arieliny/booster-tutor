/**
 * When this version of the app was built (vite.config.ts `define`), shown as "Version Nov 18,
 * 2:29 PM" in Booster Tutor's About and at the foot of LifeTutor's pages, so it's easy to tell
 * whether a phone has the newest version (Ari 2026-11-18: the update banner showed in LifeTutor
 * but not Booster Tutor, and there was no way to see which version each had).
 */
declare const __BUILD_TIME__: string;

export const BUILT_AT: string = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "";

export function versionLabel(iso = BUILT_AT): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "Version: development";
  const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `Version ${day}, ${time}`;
}
