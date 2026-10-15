import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installBrowserStubs } from "./helpers/browser-stubs";

/**
 * The per-account sync engine (src/lib/user-sync.ts) with a scripted fake
 * server. Nothing leaves the process: fetch, localStorage, window, document
 * and navigator are all stubs.
 */

type US = typeof import("../src/lib/user-sync");
let us: US;
let stubs: ReturnType<typeof installBrowserStubs>;
let stop: (() => void) | null = null;

const DEC = "booster-tutor-cube-review-decisions-v1";
const ART = "booster-tutor-cube-review-art-v1";
const EXTRAS = "booster-tutor-cube-review-extras-v1";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

interface Call {
  method: string;
  path: string;
  body?: Record<string, Record<string, { t?: number }>>;
}

/** Fake /api/userdata. `pull` answers GETs; POSTs get `{ rev, applied }`. */
function fakeServer(opts: { pull?: () => Response; post?: () => Response } = {}) {
  const calls: Call[] = [];
  const fn = vi.fn(async (path: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, path: String(path), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "POST") return opts.post ? opts.post() : json({ rev: 1, applied: 1 });
    return opts.pull ? opts.pull() : json({ rev: 1, unchanged: true });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

const seed = (key: string, value: unknown) => stubs.storage.setItem(key, JSON.stringify(value));
const stored = <T = Record<string, { t: number; status?: string }>>(key: string): T => JSON.parse(stubs.storage.getItem(key) ?? "{}");

/** Let the async run() finish: yield to the event loop until the status settles. */
async function settled() {
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setImmediate(r));
    if (us.getSyncStatus().state !== "syncing" && us.getSyncStatus().state !== "starting") return;
  }
  throw new Error(`sync never settled (state: ${us.getSyncStatus().state})`);
}

beforeEach(async () => {
  vi.resetModules();
  stubs = installBrowserStubs();
  us = await import("../src/lib/user-sync");
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("startUserSync", () => {
  it("pushes local-only changes and reports synced with nothing pending", async () => {
    seed(DEC, { a: { status: "keep", t: 100 } });
    const calls = fakeServer();
    stop = us.startUserSync("u1");
    await settled();
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].body?.decisions).toEqual({ a: { status: "keep", t: 100 } });
    expect(us.getSyncStatus()).toMatchObject({ state: "synced", pending: 0 });
    expect(us.getSyncStatus().lastSynced).not.toBeNull();
  });

  it("with nothing changed locally, only asks the server what's new (no POST)", async () => {
    const calls = fakeServer();
    stop = us.startUserSync("u1");
    await settled();
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(calls[0].path).toBe("/api/userdata?since=-1");
  });

  it("merges a newer remote edit into local storage and announces it", async () => {
    seed(DEC, { a: { status: "keep", t: 100 } });
    fakeServer({ pull: () => json({ rev: 5, decisions: { a: { status: "cut", t: 200 }, b: { note: "from phone", t: 50 } } }) });
    const remote = vi.fn();
    stubs.win.addEventListener(us.REMOTE_CHANGE_EVENT, remote);
    stop = us.startUserSync("u1");
    await settled();
    expect(stored(DEC)).toEqual({ a: { status: "cut", t: 200 }, b: { note: "from phone", t: 50 } });
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it("never overwrites a newer local edit with an older remote one", async () => {
    seed(DEC, { a: { status: "keep", t: 300 } });
    fakeServer({ pull: () => json({ rev: 5, decisions: { a: { status: "cut", t: 100 } } }) });
    const remote = vi.fn();
    stubs.win.addEventListener(us.REMOTE_CHANGE_EVENT, remote);
    stop = us.startUserSync("u1");
    await settled();
    expect(stored(DEC).a).toEqual({ status: "keep", t: 300 });
    expect(remote).not.toHaveBeenCalled();
  });

  it("merges printing choices the same way (newest wins, a stamped reset counts)", async () => {
    seed(ART, { x: { sid: "mine", t: 10 }, y: { sid: "keep-me", t: 90 } });
    fakeServer({ pull: () => json({ rev: 2, art: { x: { sid: "", t: 20 }, y: { sid: "old", t: 5 } } }) });
    stop = us.startUserSync("u1");
    await settled();
    expect(stored(ART)).toEqual({ x: { sid: "", t: 20 }, y: { sid: "keep-me", t: 90 } });
  });

  it("extra cards are add-only: new ones arrive, existing ones aren't replaced", async () => {
    seed(EXTRAS, { e1: { name: "Local E1" } });
    fakeServer({ pull: () => json({ rev: 2, extras: { e1: { name: "Remote E1" }, e2: { name: "Remote E2" } } }) });
    stop = us.startUserSync("u1");
    await settled();
    expect(stored(EXTRAS)).toEqual({ e1: { name: "Local E1" }, e2: { name: "Remote E2" } });
  });

  it("ignores malformed remote entries (no numeric timestamp)", async () => {
    fakeServer({ pull: () => json({ rev: 2, decisions: { bad: { status: "keep" }, nul: null } }) });
    stop = us.startUserSync("u1");
    await settled();
    expect(stored(DEC)).toEqual({});
  });

  it("ends a round with nothing pending once the server holds everything", async () => {
    seed(DEC, { a: { status: "keep", t: 100 }, b: { status: "cut", t: 7 } });
    const calls = fakeServer({ pull: () => json({ rev: 3, decisions: { a: { status: "keep", t: 100 } } }) });
    stop = us.startUserSync("u1");
    await settled();
    const posts = calls.filter((c) => c.method === "POST");
    // Nothing is known as pushed yet, so the first push carries both edits - once.
    expect(posts).toHaveLength(1);
    expect(Object.keys(posts[0].body?.decisions ?? {}).sort()).toEqual(["a", "b"]);
    expect(us.getSyncStatus().pending).toBe(0);
  });

  it("sends only what changed on the next round", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    seed(DEC, { a: { status: "keep", t: 100 } });
    const calls = fakeServer();
    stop = us.startUserSync("u1");
    await settled();

    // A new edit on this device, announced the way cube-review.ts does.
    seed(DEC, { a: { status: "keep", t: 100 }, b: { status: "cut", t: 200 } });
    stubs.win.dispatchEvent(new Event(us.LOCAL_CHANGE_EVENT));
    expect(us.getSyncStatus().pending).toBe(1);
    await vi.advanceTimersByTimeAsync(1300); // the ~1 s push debounce
    await settled();

    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(2);
    expect(Object.keys(posts[1].body?.decisions ?? {})).toEqual(["b"]);
    expect(us.getSyncStatus().pending).toBe(0);
  });

  it("keeps edits pending and reports offline when the network is down", async () => {
    seed(DEC, { a: { status: "keep", t: 100 } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    stop = us.startUserSync("u1");
    await settled();
    expect(us.getSyncStatus()).toMatchObject({ state: "offline", pending: 1 });
    expect(stored(DEC).a.t).toBe(100); // local data untouched
  });

  it("stops and says so when the session has ended (401)", async () => {
    seed(DEC, { a: { status: "keep", t: 100 } });
    const calls = fakeServer({ post: () => new Response("", { status: 401 }) });
    stop = us.startUserSync("u1");
    await settled();
    expect(us.getSyncStatus().state).toBe("error");
    expect(us.getSyncStatus().message).toMatch(/signed out/i);
    expect(calls).toHaveLength(1);
  });

  it("surfaces a server error without losing the pending count", async () => {
    seed(DEC, { a: { status: "keep", t: 100 } });
    fakeServer({ post: () => new Response("", { status: 500 }) });
    stop = us.startUserSync("u1");
    await settled();
    expect(us.getSyncStatus()).toMatchObject({ state: "error", pending: 1, message: "Sync failed (HTTP 500)" });
  });

  it("remembers the server revision per user, so the next start asks for less", async () => {
    fakeServer({ pull: () => json({ rev: 9, decisions: {} }) });
    stop = us.startUserSync("u1");
    await settled();
    stop();
    stop = null;
    const calls = fakeServer();
    stop = us.startUserSync("u1");
    await settled();
    expect(calls[0].path).toBe("/api/userdata?since=9");

    const other = fakeServer();
    const stop2 = us.startUserSync("someone-else");
    await settled();
    stop2();
    expect(other[0].path).toBe("/api/userdata?since=-1");
  });
});

describe("sync status store", () => {
  it("notifies subscribers and stops after unsubscribe", async () => {
    const listener = vi.fn();
    const unsub = us.subscribeSyncStatus(listener);
    fakeServer();
    stop = us.startUserSync("u1");
    await settled();
    expect(listener).toHaveBeenCalled();
    unsub();
    listener.mockClear();
    stubs.win.dispatchEvent(new Event(us.LOCAL_CHANGE_EVENT));
    expect(listener).not.toHaveBeenCalled();
  });
});
