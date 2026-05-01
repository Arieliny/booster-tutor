import { Redis } from "@upstash/redis";

/**
 * Single Redis client. Uses Vercel-set env vars (KV_REST_API_URL/TOKEN).
 * Module-level instantiation is fine for serverless: the runtime keeps the
 * instance warm between invocations within a single function instance.
 */
export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const SYNC_CODE_REGEX = /^[a-z0-9]{6,16}$/;

/**
 * Validates a sync code. Sync codes are user-provided and used as namespace
 * prefixes in KV. Reject anything that isn't a plain alphanumeric string of
 * the expected length — this prevents accidental key collisions and obvious
 * abuse.
 */
export function validateSyncCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  if (!SYNC_CODE_REGEX.test(trimmed)) return null;
  return trimmed;
}

export function metaKey(code: string): string {
  return `sync:${code}:meta`;
}
export function cubeKey(code: string, id: string): string {
  return `sync:${code}:cube:${id}`;
}
export function inventoryKey(code: string, id: string): string {
  return `sync:${code}:inv:${id}`;
}

/**
 * Per-sync-code metadata index. Holds compact info about every cube the
 * user has — enough to render the cube selector without downloading full
 * cube bodies. Keyed by cube id.
 */
export interface CubeMetaEntry {
  id: string;
  name: string;
  cardCount: number;
  archived: boolean;
  lastModified: string;
}

export interface SyncMeta {
  cubes: Record<string, CubeMetaEntry>;
}

export async function loadMeta(code: string): Promise<SyncMeta> {
  const raw = await redis.get<SyncMeta>(metaKey(code));
  if (!raw || typeof raw !== "object") return { cubes: {} };
  if (!raw.cubes || typeof raw.cubes !== "object") return { cubes: {} };
  return raw;
}

export async function saveMeta(code: string, meta: SyncMeta): Promise<void> {
  await redis.set(metaKey(code), meta);
}
