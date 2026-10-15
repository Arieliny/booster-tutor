/**
 * Who is using the app (see api/_auth.ts for the server side).
 *
 * Owner-first: the owner sees everything; a guest sees only the features the
 * owner granted. Sign-in is by a personal one-time link (/join#<token>), or the
 * owner's PIN as a fallback.
 *
 * The signed-in profile is cached in localStorage so the app still opens with
 * bad reception: when the server can't be reached we trust the cache, and we
 * only sign someone out when the server actually says their session is over.
 * The session itself lives in an HttpOnly cookie that scripts can't read.
 */

export type Feature = "play" | "setReview" | "judge";

export interface Me {
  id: string;
  name: string;
  role: "owner" | "guest";
  features: Feature[];
}

export const FEATURE_LABELS: Record<Feature, { label: string; hint: string }> = {
  play: { label: "Play", hint: "Open packs from your cubes" },
  setReview: { label: "Set grades", hint: "Limited Resources set reviews" },
  judge: { label: "Judge", hint: "Ask rules questions (a monthly number of rulings, billed to you)" },
};

const ME_KEY = "booster-tutor-me";
/** Where earlier versions kept the edit PIN; used once to sign the owner in. */
const OLD_PIN_KEY = "booster-tutor-edit-pin";

export function can(me: Me | null, feature: Feature): boolean {
  return !!me && (me.role === "owner" || me.features.includes(feature));
}

export function cachedMe(): Me | null {
  try {
    const s = localStorage.getItem(ME_KEY);
    return s ? (JSON.parse(s) as Me) : null;
  } catch {
    return null;
  }
}

function cacheMe(me: Me | null) {
  try {
    if (me) localStorage.setItem(ME_KEY, JSON.stringify(me));
    else localStorage.removeItem(ME_KEY);
  } catch {
    // Without storage the app just re-checks with the server each time.
  }
}

const isJson = (res: Response) => (res.headers.get("content-type") ?? "").includes("application/json");

export type AuthCheck = { kind: "signedIn"; me: Me; offline: boolean } | { kind: "signedOut" };

/**
 * Ask the server who we are. If it can't be reached (no signal, server down,
 * or local dev without the API), fall back to the cached profile rather than
 * locking anyone out.
 */
export async function checkAuth(): Promise<AuthCheck> {
  const fromCache = (): AuthCheck => {
    const me = cachedMe();
    return me ? { kind: "signedIn", me, offline: true } : { kind: "signedOut" };
  };
  let res: Response;
  try {
    res = await fetch("/api/auth", { cache: "no-store" });
  } catch {
    return fromCache();
  }
  if (!res.ok || !isJson(res)) return fromCache();
  const { user } = (await res.json()) as { user: Me | null };
  if (user) {
    cacheMe(user);
    return { kind: "signedIn", me: user, offline: false };
  }

  // Signed out on the server. One-time move from the old edit PIN: a device
  // that still remembers it is the owner's, so sign them straight in.
  const oldPin = readOldPin();
  if (oldPin) {
    try {
      const me = await ownerSignIn(oldPin);
      clearOldPin();
      return { kind: "signedIn", me, offline: false };
    } catch (err) {
      // Only forget the PIN if it was actually wrong; keep it on a network blip.
      if (err instanceof AuthError && err.status === 401) clearOldPin();
    }
  }
  cacheMe(null);
  return { kind: "signedOut" };
}

function readOldPin(): string | null {
  try {
    return localStorage.getItem(OLD_PIN_KEY);
  } catch {
    return null;
  }
}

function clearOldPin() {
  try {
    localStorage.removeItem(OLD_PIN_KEY);
  } catch {
    // ignore
  }
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

async function post(body: Record<string, unknown>): Promise<Me> {
  let res: Response;
  try {
    res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError("Signing in needs a connection. Try again when you have signal.", 0);
  }
  const data = isJson(res) ? ((await res.json()) as { user?: Me; error?: string }) : null;
  if (!res.ok || !data?.user) {
    throw new AuthError(data?.error ?? `Sign-in failed (HTTP ${res.status}).`, res.status);
  }
  cacheMe(data.user);
  return data.user;
}

/** Use a one-time sign-in link's token. */
export const redeemLink = (token: string) => post({ action: "redeem", token });

/** Owner fallback: sign in with the PIN. */
export const ownerSignIn = (pin: string) => post({ action: "owner", pin });

/** Pull the token out of anything pasted: a full link, or just the token. */
export function tokenFromLink(input: string): string | null {
  const s = input.trim();
  const hash = s.includes("#") ? s.slice(s.indexOf("#") + 1) : s;
  return /^[A-Za-z0-9_-]{20,}$/.test(hash) ? hash : null;
}

export async function signOut(): Promise<void> {
  try {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "signout" }),
    });
  } finally {
    cacheMe(null);
  }
}

/** The link to send someone, built for whichever domain the owner is on. */
export function signInUrl(token: string): string {
  return `${location.origin}/join#${token}`;
}

// ---------------------------------------------------------------- admin (owner)

export interface AdminUser extends Me {
  createdAt: string;
  devices: number;
  lastSeen: string | null;
  pendingLink: boolean;
  /** Guests only: rulings a month, when not the default. */
  judgeLimit?: number;
  judge: {
    /** Rulings this month. */
    used: number;
    limit: number | null;
    tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
    searches: number;
    /** Estimated spend this month, US dollars. */
    dollars: number;
  };
}

async function admin<T>(method: "GET" | "POST", body?: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/admin", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = isJson(res) ? ((await res.json()) as T & { error?: string }) : null;
  if (!res.ok || !data) throw new Error(data?.error ?? `Admin request failed (HTTP ${res.status}).`);
  return data;
}

export const adminList = () =>
  admin<{ users: AdminUser[]; defaultJudgeLimit: number }>("GET").then((d) => ({ users: d.users, defaultJudgeLimit: d.defaultJudgeLimit }));
export const adminCreate = (name: string, features: Feature[]) =>
  admin<{ token: string; user: { id: string } }>("POST", { action: "create", name, features }).then((d) => ({
    token: d.token,
    userId: d.user.id,
  }));
export const adminUpdate = (id: string, patch: { name?: string; features?: Feature[]; judgeLimit?: number | null }) =>
  admin("POST", { action: "update", id, ...patch });
export const adminNewLink = (id: string) => admin<{ token: string }>("POST", { action: "link", id }).then((d) => d.token);
export const adminSignOutEverywhere = (id: string) => admin("POST", { action: "signOutEverywhere", id });
export const adminRemove = (id: string) => admin("POST", { action: "remove", id });
