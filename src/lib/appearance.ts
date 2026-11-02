/**
 * Light or dark, for LifeTutor (Settings > Appearance). "system" follows the
 * phone. Applied as `data-theme` on <html>, which index.css reads: the dark
 * tokens are the defaults, the light ones override under [data-theme="light"].
 * Booster Tutor never applies this, so it stays dark.
 */

export type Appearance = "system" | "light" | "dark";

export const APPEARANCES: { key: Appearance; label: string }[] = [
  { key: "system", label: "Follow phone" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

const KEY = "booster-tutor-appearance-v1";
const LIGHT = "(prefers-color-scheme: light)";

export function parseAppearance(raw: unknown): Appearance {
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function loadAppearance(): Appearance {
  try {
    return parseAppearance(localStorage.getItem(KEY));
  } catch {
    return "system";
  }
}

export function saveAppearance(a: Appearance): void {
  try {
    localStorage.setItem(KEY, a);
  } catch {
    // Blocked storage: it holds until the page closes.
  }
}

/** The theme a choice comes out as right now. */
export function resolveAppearance(a: Appearance, prefersLight = window.matchMedia(LIGHT).matches): "light" | "dark" {
  return a === "system" ? (prefersLight ? "light" : "dark") : a;
}

/**
 * Put the theme on the page, and keep it in step with the phone while
 * following it. Returns the function that stops following.
 */
export function applyAppearance(a: Appearance): () => void {
  const mq = window.matchMedia(LIGHT);
  const put = () => {
    const theme = resolveAppearance(a, mq.matches);
    document.documentElement.dataset.theme = theme;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f6f7fb" : "#0b0d12");
  };
  put();
  if (a !== "system") return () => {};
  mq.addEventListener("change", put);
  return () => mq.removeEventListener("change", put);
}
