import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis.js";

/**
 * Accounts for an owner-first app.
 *
 * The owner (Ari) sees everything. Everyone else is a guest who sees only the
 * features the owner ticks for them in Admin. There are no passwords:
 *
 *   - Signing in uses a personal one-time LINK the owner creates in Admin and
 *     sends by text. Opening it on a device exchanges the token for a session.
 *   - The owner adds their own devices the same way ("Add one of your devices").
 *   - Fallback for the owner only: sign in with the existing EDIT_PIN env var
 *     (so the very first sign-in needs no new Vercel setup, and a lost device
 *     never locks the owner out). Guarded per IP AND globally, because a short
 *     PIN is only a few thousand guesses wide.
 *
 * Tokens are 32 random bytes. Redis only ever stores their SHA-256 hash, so a
 * leaked database doesn't contain working links or sessions. Sessions travel
 * in an HttpOnly cookie, so page scripts can't read them.
 *
 * Keys:
 *   auth:users                  HASH  userId -> User
 *   auth:owner                  STR   owner userId
 *   auth:session:{hash}         JSON  Session            (expires: SESSION_TTL)
 *   auth:user-sessions:{userId} SET   session hashes     (for "sign out everywhere")
 *   auth:invite:{hash}          JSON  Invite             (expires: INVITE_TTL, single use)
 *   auth:user-invite:{userId}   STR   hash of the user's current unused link
 */

/**
 * Features the owner can grant to a guest. Only features that exist get listed
 * here; Judge, Card lookup and Life counter join as they're built.
 */
export const FEATURES = ["play", "setReview"] as const;
export type Feature = (typeof FEATURES)[number];

export interface User {
  id: string;
  name: string;
  role: "owner" | "guest";
  features: Feature[];
  createdAt: string;
}

interface Session {
  userId: string;
  createdAt: string;
  lastSeen: string;
}

interface Invite {
  userId: string;
  createdAt: string;
}

const COOKIE = "bt_session";
/** Chrome caps cookie lifetimes at 400 days; refreshed on use. */
const SESSION_TTL = 400 * 24 * 60 * 60;
const INVITE_TTL = 7 * 24 * 60 * 60;

const PIN_MAX_FAILS_PER_IP = 10;
const PIN_IP_WINDOW = 15 * 60;
const PIN_MAX_FAILS_GLOBAL = 50;
const PIN_GLOBAL_WINDOW = 24 * 60 * 60;

const USERS = "auth:users";
const OWNER = "auth:owner";
const sessionKey = (h: string) => `auth:session:${h}`;
const userSessionsKey = (id: string) => `auth:user-sessions:${id}`;
const inviteKey = (h: string) => `auth:invite:${h}`;
const userInviteKey = (id: string) => `auth:user-invite:${id}`;

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const newId = () => randomBytes(9).toString("base64url");

export function isFeature(x: unknown): x is Feature {
  return typeof x === "string" && (FEATURES as readonly string[]).includes(x);
}

export function canUse(user: User, feature: Feature): boolean {
  return user.role === "owner" || user.features.includes(feature);
}

/** The shape the browser sees. */
export function publicUser(u: User) {
  return { id: u.id, name: u.name, role: u.role, features: u.role === "owner" ? [...FEATURES] : u.features };
}

// ---------------------------------------------------------------- users

export async function getUser(id: string): Promise<User | null> {
  const u = await redis.hget<User>(USERS, id);
  return u && typeof u === "object" ? u : null;
}

export async function allUsers(): Promise<User[]> {
  const all = (await redis.hgetall<Record<string, User>>(USERS)) ?? {};
  return Object.values(all).filter((u) => u && typeof u === "object");
}

export async function ownerId(): Promise<string | null> {
  return (await redis.get<string>(OWNER)) ?? null;
}

export async function saveUser(u: User): Promise<void> {
  await redis.hset(USERS, { [u.id]: u });
}

export async function createUser(name: string, role: User["role"], features: Feature[]): Promise<User> {
  const u: User = { id: newId(), name, role, features, createdAt: new Date().toISOString() };
  await saveUser(u);
  if (role === "owner") await redis.set(OWNER, u.id);
  return u;
}

/** Remove a guest entirely: their record, every session and any unused link. */
export async function deleteUser(id: string): Promise<void> {
  await revokeSessions(id);
  const pending = await redis.get<string>(userInviteKey(id));
  if (pending) await redis.del(inviteKey(pending));
  await redis.del(userInviteKey(id));
  await redis.hdel(USERS, id);
}

// ---------------------------------------------------------------- sessions

function readCookie(req: VercelRequest, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function setCookie(res: VercelResponse, value: string, maxAge: number) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
  );
}

export async function startSession(res: VercelResponse, userId: string): Promise<void> {
  const token = newToken();
  const h = hashToken(token);
  const now = new Date().toISOString();
  await redis.set(sessionKey(h), { userId, createdAt: now, lastSeen: now } satisfies Session, { ex: SESSION_TTL });
  await redis.sadd(userSessionsKey(userId), h);
  setCookie(res, token, SESSION_TTL);
}

export async function endSession(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = readCookie(req, COOKIE);
  if (token) {
    const h = hashToken(token);
    const s = await redis.get<Session>(sessionKey(h));
    await redis.del(sessionKey(h));
    if (s?.userId) await redis.srem(userSessionsKey(s.userId), h);
  }
  setCookie(res, "", 0);
}

/** Sign a user out on every device. */
export async function revokeSessions(userId: string): Promise<void> {
  const hashes = (await redis.smembers(userSessionsKey(userId))) ?? [];
  if (hashes.length) await redis.del(...hashes.map(sessionKey));
  await redis.del(userSessionsKey(userId));
}

/** Live sessions per user (pruning ones that have expired). */
export async function sessionCount(userId: string): Promise<{ count: number; lastSeen: string | null }> {
  const hashes = (await redis.smembers(userSessionsKey(userId))) ?? [];
  if (!hashes.length) return { count: 0, lastSeen: null };
  const sessions = await redis.mget<(Session | null)[]>(...hashes.map(sessionKey));
  const dead = hashes.filter((_, i) => !sessions[i]);
  if (dead.length) await redis.srem(userSessionsKey(userId), ...dead);
  const live = sessions.filter((s): s is Session => !!s);
  const lastSeen = live.map((s) => s.lastSeen).sort().at(-1) ?? null;
  return { count: live.length, lastSeen };
}

/** The signed-in user for this request, or null. Refreshes the session daily. */
export async function currentUser(req: VercelRequest): Promise<User | null> {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const h = hashToken(token);
  const s = await redis.get<Session>(sessionKey(h));
  if (!s) return null;
  const user = await getUser(s.userId);
  if (!user) {
    await redis.del(sessionKey(h));
    return null;
  }
  if (Date.now() - Date.parse(s.lastSeen) > 24 * 60 * 60 * 1000) {
    await redis.set(sessionKey(h), { ...s, lastSeen: new Date().toISOString() }, { ex: SESSION_TTL });
  }
  return user;
}

/**
 * Gate an API handler. Responds 401 (not signed in) / 403 (not allowed) itself
 * and returns null; otherwise returns the user.
 */
export async function requireUser(
  req: VercelRequest,
  res: VercelResponse,
  allowed: (u: User) => boolean = () => true,
): Promise<User | null> {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in to use this." });
    return null;
  }
  if (!allowed(user)) {
    res.status(403).json({ error: "You don't have access to this." });
    return null;
  }
  return user;
}

export const isOwner = (u: User) => u.role === "owner";

// ---------------------------------------------------------------- sign-in links

/** A fresh one-time link token for a user, replacing any unused one. */
export async function createInvite(userId: string): Promise<string> {
  const old = await redis.get<string>(userInviteKey(userId));
  if (old) await redis.del(inviteKey(old));
  const token = newToken();
  const h = hashToken(token);
  await redis.set(inviteKey(h), { userId, createdAt: new Date().toISOString() } satisfies Invite, { ex: INVITE_TTL });
  await redis.set(userInviteKey(userId), h, { ex: INVITE_TTL });
  return token;
}

export async function hasPendingInvite(userId: string): Promise<boolean> {
  const h = await redis.get<string>(userInviteKey(userId));
  return !!h && !!(await redis.exists(inviteKey(h)));
}

/** Use up a link: returns its user id, or null if unknown/expired/already used. */
export async function redeemInvite(token: string): Promise<string | null> {
  const h = hashToken(token);
  const invite = await redis.getdel<Invite>(inviteKey(h));
  if (!invite?.userId) return null;
  await redis.del(userInviteKey(invite.userId));
  return (await getUser(invite.userId)) ? invite.userId : null;
}

// ---------------------------------------------------------------- owner PIN fallback

export function clientIp(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  return (typeof raw === "string" ? raw.split(",")[0].trim() : "") || "unknown";
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(a, a); // keep timing similar on a length mismatch
    return false;
  }
  return timingSafeEqual(a, b);
}

export type PinResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Check the owner PIN with brute-force limits: per IP (so a stranger can't lock
 * the owner out) and a global ceiling (so many IPs can't sweep a short PIN).
 */
export async function checkOwnerPin(req: VercelRequest, pin: unknown): Promise<PinResult> {
  const expected = process.env.EDIT_PIN;
  if (!expected) return { ok: false, status: 503, error: "Owner sign-in isn't configured (EDIT_PIN is unset)." };

  const ipKey = `auth:pinfails:${clientIp(req)}`;
  const globalKey = "auth:pinfails:all";
  const [ipFails, globalFails] = (await redis.mget<(number | string | null)[]>(ipKey, globalKey)).map((v) => Number(v ?? 0));
  if (ipFails >= PIN_MAX_FAILS_PER_IP) {
    return { ok: false, status: 429, error: `Too many wrong tries. Wait ${PIN_IP_WINDOW / 60} minutes.` };
  }
  if (globalFails >= PIN_MAX_FAILS_GLOBAL) {
    return { ok: false, status: 429, error: "PIN sign-in is paused for today. Use a sign-in link from one of your devices." };
  }
  if (typeof pin !== "string" || !secretsMatch(pin, expected)) {
    if ((await redis.incr(ipKey)) === 1) await redis.expire(ipKey, PIN_IP_WINDOW);
    if ((await redis.incr(globalKey)) === 1) await redis.expire(globalKey, PIN_GLOBAL_WINDOW);
    return { ok: false, status: 401, error: "That PIN isn't right." };
  }
  await redis.del(ipKey);
  return { ok: true };
}
