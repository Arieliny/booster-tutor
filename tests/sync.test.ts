import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NotAuthorizedError, fetchCube, getSyncCode, pullSync, pushArchive, pushCube, pushInventory, pushRestore } from "../src/lib/sync";
import type { Cube } from "../src/types";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

const cube = { id: "c1", name: "Test", generated_at: "2026-01-01", cards: [] } as Cube;

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("shared library namespace", () => {
  let validateSyncCode: (input: unknown) => string | null;
  beforeAll(async () => {
    process.env.BT_FAKE_REDIS = "1";
    ({ validateSyncCode } = await import("../api/_redis"));
  });

  it("is a constant the server's sync-code validation accepts as-is", () => {
    expect(getSyncCode()).toBe("boostertutor");
    expect(validateSyncCode(getSyncCode())).toBe(getSyncCode());
  });

  it("the server rejects codes with the wrong shape", () => {
    for (const bad of ["short", "has-dash-1", "UPPER_case!", "x".repeat(17), "", 42, null]) {
      expect(validateSyncCode(bad)).toBeNull();
    }
    expect(validateSyncCode("  AbC123xyz ")).toBe("abc123xyz"); // trimmed + lowercased
  });
});

describe("pullSync / fetchCube", () => {
  it("returns the server's library on success and URL-encodes the code", async () => {
    const payload = { meta: { cubes: {} }, inventories: {} };
    const f = mockFetch(() => json(payload));
    expect(await pullSync("a b/c")).toEqual(payload);
    expect(f.mock.calls[0][0]).toBe("/api/sync?code=a%20b%2Fc");
  });

  it("explains itself when there's no serverless runtime (source served instead of JSON)", async () => {
    mockFetch(() => new Response("export default 1", { status: 200, headers: { "content-type": "application/javascript" } }));
    await expect(pullSync("boostertutor")).rejects.toThrow(/serverless API isn't running/);
  });

  it("throws on an HTTP error", async () => {
    mockFetch(() => new Response("no", { status: 500 }));
    await expect(pullSync("boostertutor")).rejects.toThrow("Pull failed: HTTP 500");
    await expect(fetchCube("boostertutor", "c1")).rejects.toThrow("Fetch cube failed: HTTP 500");
  });

  it("fetches one cube by code and id", async () => {
    const f = mockFetch(() => json(cube));
    expect(await fetchCube("boostertutor", "c 1")).toEqual(cube);
    expect(f.mock.calls[0][0]).toBe("/api/cube?code=boostertutor&id=c%201");
  });
});

describe("writes", () => {
  it("each write POSTs its action as JSON", async () => {
    const f = mockFetch(() => json({ ok: true }));
    await pushCube("boostertutor", cube);
    await pushArchive("boostertutor", "c1");
    await pushRestore("boostertutor", "c1");
    await pushInventory("boostertutor", "c1", ["a", "b"]);
    const bodies = f.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toEqual([
      { action: "putCube", cube },
      { action: "archiveCube", id: "c1" },
      { action: "restoreCube", id: "c1" },
      { action: "putInventory", cubeId: "c1", ids: ["a", "b"] },
    ]);
    for (const [url, init] of f.mock.calls) {
      expect(url).toBe("/api/sync?code=boostertutor");
      expect(init?.method).toBe("POST");
    }
  });

  it("401 means signed out, 403 means not the owner - both NotAuthorizedError", async () => {
    mockFetch(() => new Response("", { status: 401 }));
    const err = await pushCube("boostertutor", cube).catch((e) => e);
    expect(err).toBeInstanceOf(NotAuthorizedError);
    expect(err.name).toBe("NotAuthorizedError");
    expect(err.message).toMatch(/signed out/i);

    mockFetch(() => new Response("", { status: 403 }));
    const err2 = await pushArchive("boostertutor", "c1").catch((e) => e);
    expect(err2).toBeInstanceOf(NotAuthorizedError);
    expect(err2.message).toBe("Only the owner can change cubes.");
  });

  it("other failures are plain Errors carrying the status and body", async () => {
    mockFetch(() => new Response("boom", { status: 500 }));
    const err = await pushInventory("boostertutor", "c1", []).catch((e) => e);
    expect(err).not.toBeInstanceOf(NotAuthorizedError);
    expect(err.message).toBe("Push failed: HTTP 500 boom");
  });
});
