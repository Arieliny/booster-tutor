/**
 * In-memory stand-in for the Upstash client, for LOCAL testing only
 * (scripts/dev-api.ts sets BT_FAKE_REDIS=1; production never does).
 *
 * Covers just the commands the API uses, and mimics Upstash's automatic JSON
 * (de)serialization: objects go in as objects and come back parsed.
 */

type Entry = { v: string; exp: number | null };

const enc = (v: unknown) => JSON.stringify(v);
const dec = <T>(s: string | undefined | null): T | null => {
  if (s == null) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return s as unknown as T;
  }
};

export function fakeRedis() {
  const kv = new Map<string, Entry>();
  const hashes = new Map<string, Map<string, string>>();
  const sets = new Map<string, Set<string>>();

  const live = (k: string): Entry | undefined => {
    const e = kv.get(k);
    if (e && e.exp !== null && e.exp <= Date.now()) {
      kv.delete(k);
      return undefined;
    }
    return e;
  };

  const client = {
    async get<T>(k: string) {
      return dec<T>(live(k)?.v);
    },
    async set(k: string, v: unknown, opts?: { ex?: number }) {
      kv.set(k, { v: enc(v), exp: opts?.ex ? Date.now() + opts.ex * 1000 : null });
      return "OK";
    },
    async getdel<T>(k: string) {
      const e = live(k);
      kv.delete(k);
      return dec<T>(e?.v);
    },
    async mget<T>(...keys: string[]) {
      return keys.map((k) => dec(live(k)?.v)) as T;
    },
    async del(...keys: string[]) {
      let n = 0;
      for (const k of keys) {
        if (kv.delete(k)) n++;
        if (hashes.delete(k)) n++;
        if (sets.delete(k)) n++;
      }
      return n;
    },
    async exists(...keys: string[]) {
      return keys.filter((k) => live(k) || hashes.has(k) || sets.has(k)).length;
    },
    async incr(k: string) {
      const e = live(k);
      const n = Number(e ? dec(e.v) : 0) + 1;
      kv.set(k, { v: enc(n), exp: e?.exp ?? null });
      return n;
    },
    async decr(k: string) {
      const e = live(k);
      const n = Number(e ? dec(e.v) : 0) - 1;
      kv.set(k, { v: enc(n), exp: e?.exp ?? null });
      return n;
    },
    async hincrby(k: string, f: string, by: number) {
      const h = hashes.get(k) ?? new Map<string, string>();
      const n = Number(dec(h.get(f)) ?? 0) + by;
      h.set(f, enc(n));
      hashes.set(k, h);
      return n;
    },
    async expire(k: string, seconds: number) {
      const e = live(k);
      if (!e) return 0;
      e.exp = Date.now() + seconds * 1000;
      return 1;
    },
    async hget<T>(k: string, f: string) {
      return dec<T>(hashes.get(k)?.get(f));
    },
    async hset(k: string, fields: Record<string, unknown>) {
      const h = hashes.get(k) ?? new Map<string, string>();
      for (const [f, v] of Object.entries(fields)) h.set(f, enc(v));
      hashes.set(k, h);
      return Object.keys(fields).length;
    },
    /** Like Upstash: {field: value | null}, or null when none of the fields exist. */
    async hmget<T>(k: string, ...fields: string[]) {
      const h = hashes.get(k);
      const out = Object.fromEntries(fields.map((f) => [f, dec(h?.get(f))]));
      return (Object.values(out).every((v) => v === null) ? null : out) as T;
    },
    async hgetall<T>(k: string) {
      const h = hashes.get(k);
      if (!h) return null as T;
      return Object.fromEntries([...h].map(([f, v]) => [f, dec(v)])) as T;
    },
    async hdel(k: string, ...fields: string[]) {
      const h = hashes.get(k);
      return fields.filter((f) => h?.delete(f)).length;
    },
    async sadd(k: string, ...members: string[]) {
      const s = sets.get(k) ?? new Set<string>();
      members.forEach((m) => s.add(m));
      sets.set(k, s);
      return members.length;
    },
    async srem(k: string, ...members: string[]) {
      const s = sets.get(k);
      return members.filter((m) => s?.delete(m)).length;
    },
    async smembers(k: string) {
      return [...(sets.get(k) ?? [])];
    },
    async scan(_cursor: string | number, opts?: { match?: string }) {
      const pattern = opts?.match ?? "*";
      // Only "prefix*" patterns are needed; anything else is an exact match.
      const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : null;
      const match = (k: string) => (prefix !== null ? k.startsWith(prefix) : k === pattern);
      const keys = [...new Set([...kv.keys(), ...hashes.keys(), ...sets.keys()])].filter(match);
      return ["0", keys] as [string, string[]];
    },
    async ping() {
      return "PONG";
    },
    /** Like Upstash's multi(): chain commands, then exec() runs them in order and returns the results. */
    multi() {
      const ops: (() => Promise<unknown>)[] = [];
      const tx: Record<string, unknown> = new Proxy(
        {},
        {
          get: (_, name: string) =>
            name === "exec"
              ? async () => {
                  const out: unknown[] = [];
                  for (const op of ops) out.push(await op());
                  return out;
                }
              : (...args: unknown[]) => {
                  ops.push(() => (client as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[name](...args));
                  return tx;
                },
        },
      );
      return tx;
    },
  };
  return client;
}
