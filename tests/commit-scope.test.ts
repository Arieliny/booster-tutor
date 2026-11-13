import { beforeEach, describe, expect, it, vi } from "vitest";
import { installBrowserStubs } from "./helpers/browser-stubs";
import type { Checklist, Mark } from "../src/lib/checklists";

type S = typeof import("../src/lib/commit-scope");
let s: S;

beforeEach(async () => {
  vi.resetModules();
  installBrowserStubs();
  s = await import("../src/lib/commit-scope");
});

const names: Record<string, string> = {
  geist: "Geist of Saint Thalia",
  crab: "Crabomination",
  karakas: "Karakas",
  waste: "Wasteland",
  fire: "Fire // Ice",
};
const nameOf = (id: string) => names[id];
const list = (id: string, source: Checklist["source"]): Checklist => ({ id, name: id, source, created: 1 });

describe("what gets committed", () => {
  it("counts only cards ticked on a Coming in / Going out checklist or an order list", () => {
    const lists = [
      list("in", { kind: "review", which: "add" }),
      list("out", { kind: "review", which: "cut" }),
      list("order", { kind: "names", names: ["Fire // Ice", "Crabomination"] }),
      list("now", { kind: "review", which: "now" }),
    ];
    const marks: Record<string, Record<string, Mark>> = {
      in: { crab: 1, geist: 2 }, // Geist flagged with a problem: not ticked
      out: { karakas: 1 },
      order: { fire: 1 }, // order lists mark by name
      now: { waste: 1 }, // a tick on "the cube as it is" isn't a cut
    };
    const r = s.tickedScope(["geist", "crab", "fire"], ["karakas", "waste"], lists, marks, nameOf);
    expect(r).toEqual({ adds: ["crab", "fire"], cuts: ["karakas"], addsWaiting: ["geist"], cutsWaiting: ["waste"] });
  });

  it("a name ticked on an order list only counts if that list has the card", () => {
    const lists = [list("order", { kind: "names", names: ["Crabomination"] })];
    const r = s.tickedScope(["geist"], [], lists, { order: { "geist of saint thalia": 1 } }, nameOf);
    expect(r.adds).toEqual([]);
  });

  it("defaults to ticked-only when there's a Coming in or Going out checklist", () => {
    expect(s.hasCommitChecklist([list("a", { kind: "review", which: "maybe" })])).toBe(false);
    expect(s.hasCommitChecklist([list("a", { kind: "review", which: "cut" })])).toBe(true);
  });
});

describe("real copy or proxy", () => {
  it("Ari's choice, then the order list, then the proxy orders, else real", () => {
    expect(s.copyKind(["MPC #3"], undefined, "REAL")).toEqual({ tag: "REAL", why: "you set it" });
    expect(s.copyKind(["MPC #1"], "Face to Face", undefined)).toEqual({ tag: "REAL", why: "Face to Face" });
    expect(s.copyKind(undefined, "MPC proxy order #3", undefined)).toEqual({ tag: "PROXY", why: "MPC proxy order #3" });
    expect(s.copyKind(["MPC #1", "MPC #3"], undefined, undefined)).toEqual({ tag: "PROXY", why: "MPC #1, MPC #3" });
    expect(s.copyKind(undefined, undefined, undefined)).toEqual({ tag: "REAL", why: "not in a proxy order" });
  });

  it("reads where an order list says a card comes from", () => {
    const lists = [
      list("in", { kind: "review", which: "add" }),
      list("order", { kind: "names", names: ["Crabomination"], details: { crabomination: { from: "Face to Face", printing: "Modern Horizons 3 #85" } } }),
    ];
    expect(s.orderDetail("Crabomination", lists)).toEqual({ from: "Face to Face", printing: "Modern Horizons 3 #85" });
    expect(s.orderDetail("Geist of Saint Thalia", lists)).toEqual({});
  });
});

describe("the powered deck and the request for Claude", () => {
  it("writes Moxfield Bulk Edit lines with the tags", () => {
    expect(s.poweredLine("Karakas", "leg", "303", "PROXY")).toBe("1 Karakas (LEG) 303 #CUBE #PROXY");
  });

  it("lists adds with both printings' sources, cuts, and what to leave out", () => {
    const text = s.claudeRequest({
      cubeId: "PiemanPoweredCube",
      before: 546,
      after: 546,
      adds: [{ name: "Geist of Saint Thalia", set: "fra", collectorNumber: "299", tag: "REAL", why: "not in a proxy order", has: "FRA #214" }],
      cuts: [{ name: "Karakas", set: "leg", collectorNumber: "303" }],
      waiting: ["Wasteland"],
      moxfield: s.POWERED_MOXFIELD,
    });
    expect(text).toContain("Committing cube changes.md");
    expect(text).toContain("PiemanPoweredCube, 546 -> 546 cards.");
    expect(text).toContain("- Geist of Saint Thalia: Cube Cobra fra|299; Moxfield #REAL (not in a proxy order, my copy is FRA #214)");
    expect(text).toContain("- Karakas (on Cube Cobra as LEG 303)");
    expect(text).toContain("leave these out: Wasteland.");
  });
});
