import { beforeEach, describe, expect, it, vi } from "vitest";
import { installBrowserStubs } from "./helpers/browser-stubs";

type C = typeof import("../src/lib/checklists");
let cl: C;

beforeEach(async () => {
  vi.resetModules();
  installBrowserStubs();
  cl = await import("../src/lib/checklists");
});

describe("pasted card lists", () => {
  it("reads the usual list formats, once each, in order", () => {
    const text = [
      "Deck",
      "2 Lightning Bolt",
      "1x Counterspell",
      "Swords to Plowshares (STA) 10",
      "Brainstorm *F*",
      "",
      "// a comment",
      "Sideboard",
      "lightning bolt",
      "Lim-Dûl's Vault",
    ].join("\n");
    expect(cl.parseNames(text)).toEqual(["Lightning Bolt", "Counterspell", "Swords to Plowshares", "Brainstorm", "Lim-Dûl's Vault"]);
  });

  it("keys names the same whatever the accents, case or apostrophes, and keeps keys short", () => {
    expect(cl.nameKey("Lim-Dûl's Vault")).toBe(cl.nameKey("lim dul's vault"));
    expect(cl.nameKey("Fire // Ice")).toBe(cl.nameKey("Fire"));
    expect(cl.nameKey("x".repeat(80)).length).toBeLessThanOrEqual(48);
  });
});

describe("checklists", () => {
  it("keep their own progress, so switching never loses any", () => {
    const a = cl.createChecklist("Coming in", { kind: "review", which: "add" });
    const b = cl.createChecklist("Pauper cuts", { kind: "names", names: ["Counterspell", "Brainstorm"] });
    cl.setMark(a, "id-1", 1);
    cl.setMark(b, "counterspell", 1);
    cl.setMark(b, "brainstorm", 2);
    const { lists, marks } = cl.loadChecklists();
    expect(lists.map((l) => l.name)).toEqual(["Coming in", "Pauper cuts"]);
    expect(marks[a]).toEqual({ "id-1": 1 });
    expect(marks[b]).toEqual({ counterspell: 1, brainstorm: 2 });
  });

  it("starts one over without touching another, and renames", () => {
    const a = cl.createChecklist("A", { kind: "review", which: "cut" });
    const b = cl.createChecklist("B", { kind: "review", which: "cut" });
    cl.setMark(a, "x", 1);
    cl.setMark(b, "x", 1);
    cl.resetChecklist(a);
    cl.renameChecklist(b, "  Box   one ");
    const { lists, marks } = cl.loadChecklists();
    expect(marks[a]).toBeUndefined();
    expect(marks[b]).toEqual({ x: 1 });
    expect(lists.find((l) => l.id === b)?.name).toBe("Box one");
  });

  it("deletes as a stamped tombstone (so it stays deleted when devices sync)", () => {
    const a = cl.createChecklist("Gone", { kind: "review", which: "add" });
    cl.setMark(a, "x", 1);
    cl.deleteChecklist(a);
    expect(cl.loadChecklists().lists).toHaveLength(0);
    const raw = JSON.parse(localStorage.getItem(cl.CHECKLISTS_KEY)!);
    expect(raw[`l:${a}`].deleted).toBe(true);
    expect(typeof raw[`l:${a}`].t).toBe("number");
  });

  it("stamps every edit later than the last, so the newest edit wins a merge", () => {
    const a = cl.createChecklist("A", { kind: "review", which: "add" });
    cl.setMark(a, "x", 1);
    cl.setMark(a, "x", 0);
    cl.setMark(a, "x", 2);
    const raw = JSON.parse(localStorage.getItem(cl.CHECKLISTS_KEY)!);
    const keys = Object.keys(raw);
    expect(keys.every((k) => k.length <= 64)).toBe(true);
    expect(raw[`m:${a}:x`]).toMatchObject({ s: 2 });
    expect(raw[`m:${a}:x`].t).toBeGreaterThan(raw[`l:${a}`].t);
  });
});
