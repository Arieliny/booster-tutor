import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installBrowserStubs } from "./helpers/browser-stubs";

type CR = typeof import("../src/lib/cube-review");
let cr: CR;
let stubs: ReturnType<typeof installBrowserStubs>;

// cube-review.ts keeps decisions/extras/printing choices in module state backed
// by localStorage, so every test gets fresh module state and fresh storage.
beforeEach(async () => {
  vi.resetModules();
  stubs = installBrowserStubs();
  cr = await import("../src/lib/cube-review");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Real ids from the bundled data: cards in my cube, and cards outside it (the data is local, no network). */
function inMine(n: number): string[] {
  return cr.data.cubes.mine.cards.slice(0, n);
}
function outsideMine(n: number): string[] {
  return cr.data.cubes.lsv.cards.filter((id) => !cr.members.mine.has(id) && cr.data.cards[id]).slice(0, n);
}

describe("mergeDecisions (live sync merge)", () => {
  it("takes the newer edit per card and leaves the rest alone", () => {
    const current = { a: { status: "keep" as const, t: 100 }, b: { status: "cut" as const, t: 300 } };
    const incoming = { a: { status: "cut" as const, t: 200 }, b: { status: "keep" as const, t: 100 }, c: { note: "new", t: 1 } };
    const out = cr.mergeDecisions(current, incoming);
    expect(out.a).toEqual({ status: "cut", t: 200 });
    expect(out.b).toEqual({ status: "cut", t: 300 });
    expect(out.c).toEqual({ note: "new", t: 1 });
  });

  it("keeps the current entry on a timestamp tie", () => {
    const current = { a: { status: "keep" as const, t: 5 } };
    expect(cr.mergeDecisions(current, { a: { status: "cut", t: 5 } }).a.status).toBe("keep");
  });

  it("returns the same object when nothing changed, and never mutates its inputs", () => {
    const current = { a: { status: "keep" as const, t: 10 } };
    const incoming = { a: { status: "cut" as const, t: 5 } };
    expect(cr.mergeDecisions(current, incoming)).toBe(current);

    const newer = { a: { status: "cut" as const, t: 50 } };
    const out = cr.mergeDecisions(current, newer);
    expect(out).not.toBe(current);
    expect(current.a.status).toBe("keep");
  });

  it("skips malformed entries (no numeric timestamp)", () => {
    const out = cr.mergeDecisions({}, { a: { status: "keep" } as never, b: null as never });
    expect(out).toEqual({});
  });

  it("converges: merging A into B and B into A gives the same result", () => {
    const a = { x: { status: "keep" as const, t: 1 }, y: { status: "cut" as const, t: 9 }, onlyA: { note: "a", t: 4 } };
    const b = { x: { status: "cut" as const, t: 2 }, y: { status: "keep" as const, t: 3 }, onlyB: { note: "b", t: 7 } };
    expect(cr.mergeDecisions(a, b)).toEqual(cr.mergeDecisions(b, a));
  });
});

describe("prune", () => {
  it("drops entries with neither a status nor a note", () => {
    const out = cr.prune({
      a: { status: "keep", t: 1 },
      b: { note: "hmm", t: 2 },
      c: { t: 3 },
      d: { note: "", t: 4 },
    });
    expect(Object.keys(out).sort()).toEqual(["a", "b"]);
  });
});

describe("export / import merge (two devices)", () => {
  const file = (decisions: object, extra: object = {}) =>
    JSON.stringify({ app: "booster-tutor-cube-review", version: 1, exportedAt: "2026-01-01", decisions, ...extra });

  it("merges per card, newest t wins in both directions", () => {
    const current = { a: { status: "keep" as const, t: 100 }, b: { status: "cut" as const, t: 500 } };
    const r = cr.mergeImport(current, file({ a: { status: "cut", t: 200 }, b: { status: "keep", t: 400 }, c: { status: "add", t: 50 } }));
    expect(r.merged.a).toEqual({ status: "cut", t: 200 }); // incoming newer
    expect(r.merged.b).toEqual({ status: "cut", t: 500 }); // local newer
    expect(r.merged.c).toEqual({ status: "add", t: 50 }); // only in the file
    expect(r.updated).toBe(2);
    expect(r.total).toBe(3);
  });

  it("is order-independent: A<-B and B<-A converge on the same decisions", () => {
    const A = { x: { status: "keep" as const, t: 10 }, y: { status: "cut" as const, t: 30 } };
    const B = { x: { status: "cut" as const, t: 20 }, y: { status: "keep" as const, t: 25 }, z: { note: "n", t: 5 } };
    const onA = cr.mergeImport(A, file(B)).merged;
    const onB = cr.mergeImport(B, file(A)).merged;
    expect(onA).toEqual(onB);
  });

  it("importing the same file twice changes nothing the second time", () => {
    const text = file({ a: { status: "keep", t: 10 } });
    const first = cr.mergeImport({}, text);
    const second = cr.mergeImport(first.merged, text);
    expect(second.merged).toEqual(first.merged);
    expect(second.updated).toBe(0);
  });

  it("prunes cleared entries (no status, no note) from the result", () => {
    const r = cr.mergeImport({ a: { status: "keep", t: 1 } }, file({ a: { t: 2 } }));
    expect(r.merged).toEqual({});
  });

  it("rejects files that aren't Booster Tutor cube review exports", () => {
    expect(() => cr.mergeImport({}, JSON.stringify({ app: "something-else", decisions: {} }))).toThrow(/isn't a Booster Tutor cube review file/);
    expect(() => cr.mergeImport({}, "not json")).toThrow();
  });

  it("skips malformed incoming entries without counting them as updates", () => {
    const r = cr.mergeImport({}, file({ a: { status: "keep" }, b: null, c: { status: "cut", t: 9 } }));
    expect(Object.keys(r.merged)).toEqual(["c"]);
    expect(r.updated).toBe(1);
    expect(r.total).toBe(3);
  });

  it("merges chosen printings per card by timestamp (a stamped reset also wins)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1000);
    cr.setArtChoice("card1", { sid: "old-print", label: "LEA" });
    const r1 = cr.mergeImport({}, file({}, { art: { card1: { sid: "newer-print", t: 2000 }, card2: { sid: "p2", t: 5 } } }));
    expect(r1.artUpdated).toBe(2);
    expect(cr.artChoice("card1")?.sid).toBe("newer-print");
    expect(cr.artChoice("card2")?.sid).toBe("p2");

    // An older file can't undo a newer local choice.
    const r2 = cr.mergeImport({}, file({}, { art: { card1: { sid: "stale", t: 1500 } } }));
    expect(r2.artUpdated).toBe(0);
    expect(cr.artChoice("card1")?.sid).toBe("newer-print");

    // A newer reset (empty sid) wins, and reads back as "no choice".
    cr.mergeImport({}, file({}, { art: { card1: { sid: "", t: 3000 } } }));
    expect(cr.artChoice("card1")).toBeUndefined();
  });

  it("brings hand-added cards across and reports how many were new", () => {
    const extra = { id: "extra-1", sid: "s1", name: "Zzz Imported", cost: "", cmc: 0, colors: [], ci: [], type: "Artifact", text: "", rarity: "rare", layout: "normal" };
    const r = cr.mergeImport({}, file({}, { extraCards: { "extra-1": extra } }));
    expect(r.newCards).toBe(1);
    expect(cr.hasCard("extra-1")).toBe(true);
    expect(cr.isExtra("extra-1")).toBe(true);
    // Importing again adds nothing new.
    expect(cr.mergeImport({}, file({}, { extraCards: { "extra-1": extra } })).newCards).toBe(0);
  });

  it("round-trips: an export from one device, imported into another, reproduces the decisions", () => {
    const decisions = { a: { status: "keep" as const, t: 1 }, b: { note: "think", t: 2 }, empty: { t: 3 } };
    const exported = cr.toExportFile(decisions);
    expect(exported.app).toBe("booster-tutor-cube-review");
    expect(exported.version).toBe(1);
    expect(Object.keys(exported.decisions).sort()).toEqual(["a", "b"]); // pruned on export
    const r = cr.mergeImport({}, JSON.stringify(exported));
    expect(r.merged).toEqual({ a: decisions.a, b: decisions.b });
  });
});

describe("saved decisions", () => {
  it("round-trips through localStorage and tolerates corrupt data", () => {
    expect(cr.loadDecisions()).toEqual({});
    expect(cr.saveDecisions({ a: { status: "keep", t: 1 } })).toBe(true);
    expect(cr.loadDecisions()).toEqual({ a: { status: "keep", t: 1 } });
    stubs.storage.setItem("booster-tutor-cube-review-decisions-v1", "{broken");
    expect(cr.loadDecisions()).toEqual({});
  });

  it("tells the sync engine about local saves", () => {
    const heard = vi.fn();
    stubs.win.addEventListener("bt-userdata-local", heard);
    cr.saveDecisions({ a: { status: "keep", t: 1 } });
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe("status semantics", () => {
  it("maps yes/no/maybe to the right words for where the card is", () => {
    const [mine] = inMine(1);
    const [outside] = outsideMine(1);
    expect(cr.statusFor(mine, "yes")).toBe("keep");
    expect(cr.statusFor(mine, "no")).toBe("cut");
    expect(cr.statusFor(outside, "yes")).toBe("add");
    expect(cr.statusFor(outside, "no")).toBe("no");
    expect(cr.statusFor(mine, "maybe")).toBe("maybe");
    expect(cr.choicesFor(mine)).toEqual(["keep", "cut", "maybe"]);
    expect(cr.choicesFor(outside)).toEqual(["add", "no", "maybe"]);
  });

  it("re-words stale statuses when a card moves in or out of my cube", () => {
    const [mine] = inMine(1);
    const [outside] = outsideMine(1);
    expect(cr.normalizeStatus(outside, "cut")).toBe("no"); // a "Cut" on a card I don't run
    expect(cr.normalizeStatus(mine, "add")).toBe("keep"); // an "Add" on a card now in my cube
    expect(cr.normalizeStatus(mine, "no")).toBe("cut");
    expect(cr.normalizeStatus(mine, "maybe")).toBe("maybe");
    expect(cr.normalizeStatus(mine, undefined)).toBeUndefined();
  });
});

describe("summarize", () => {
  it("counts statuses and computes the resulting cube size from cuts and adds", () => {
    const [k1, c1, c2, m1] = inMine(4);
    const [a1, a2, n1, m2] = outsideMine(4);
    const t = 1;
    const s = cr.summarize({
      [k1]: { status: "keep", t },
      [c1]: { status: "cut", t },
      [c2]: { status: "cut", t },
      [m1]: { status: "maybe", t },
      [a1]: { status: "add", t },
      [a2]: { status: "add", t },
      [n1]: { status: "no", t },
      [m2]: { status: "maybe", t },
    });
    expect(s.counts).toEqual({ keep: 1, cut: 2, add: 2, no: 1, maybe: 2 });
    expect(s.maybeCut).toBe(1); // the maybe in my cube
    expect(s.maybeAdd).toBe(1); // the maybe outside it
    expect(s.cuts.map((c) => c.id).sort()).toEqual([c1, c2].sort());
    expect(s.adds.map((c) => c.id).sort()).toEqual([a1, a2].sort());
    expect(s.current).toBe(cr.members.mine.size);
    expect(s.result).toBe(s.current - 2 + 2);
  });

  it("result = current - cuts + adds", () => {
    const cuts = inMine(5);
    const adds = outsideMine(2);
    const d: import("../src/lib/cube-review").Decisions = {};
    for (const id of cuts) d[id] = { status: "cut", t: 1 };
    for (const id of adds) d[id] = { status: "add", t: 1 };
    const s = cr.summarize(d);
    expect(s.result).toBe(cr.members.mine.size - 5 + 2);
  });

  it("lists cuts and adds alphabetically by name", () => {
    const d: import("../src/lib/cube-review").Decisions = {};
    for (const id of inMine(8)) d[id] = { status: "cut", t: 1 };
    for (const id of outsideMine(8)) d[id] = { status: "add", t: 1 };
    const s = cr.summarize(d);
    const sorted = (xs: { name: string }[]) => xs.map((c) => c.name).every((n, i, a) => i === 0 || a[i - 1].localeCompare(n) <= 0);
    expect(sorted(s.cuts)).toBe(true);
    expect(sorted(s.adds)).toBe(true);
  });

  it("normalizes stale statuses and ignores note-only entries and unknown card ids", () => {
    const [mine] = inMine(1);
    const [outside] = outsideMine(1);
    const s = cr.summarize({
      [outside]: { status: "cut", t: 1 }, // really a "no" now
      [mine]: { note: "just a note", t: 1 },
      "not-a-real-card": { status: "cut", t: 1 },
    });
    expect(s.counts).toEqual({ keep: 0, cut: 0, add: 0, no: 1, maybe: 0 });
    expect(s.cuts).toEqual([]);
    expect(s.result).toBe(s.current);
  });

  it("an empty review leaves the cube as it is", () => {
    const s = cr.summarize({});
    expect(s.counts).toEqual({ keep: 0, cut: 0, add: 0, no: 0, maybe: 0 });
    expect(s.result).toBe(s.current);
    expect(s.balance.map((b) => b.minus + b.plus)).toEqual(Array(cr.BALANCE_ROWS.length).fill(0));
  });

  it("balance rows add up to the cube and track cuts/adds in the right row", () => {
    const [cutId] = inMine(1);
    const [addId] = outsideMine(1);
    const s = cr.summarize({ [cutId]: { status: "cut", t: 1 }, [addId]: { status: "add", t: 1 } });
    expect(s.balance.reduce((n, b) => n + b.now, 0)).toBe(cr.members.mine.size);
    expect(s.balance.reduce((n, b) => n + b.minus, 0)).toBe(1);
    expect(s.balance.reduce((n, b) => n + b.plus, 0)).toBe(1);
    expect(s.balance.find((b) => b.id === cr.balanceRow(cr.card(cutId)))!.minus).toBe(1);
    expect(s.balance.find((b) => b.id === cr.balanceRow(cr.card(addId)))!.plus).toBe(1);
  });
});

describe("card facets and changelog helpers", () => {
  const base = { id: "x", sid: "s", name: "X", cost: "", cmc: 0, colors: [], ci: [], type: "Creature", text: "", rarity: "common", layout: "normal" };

  it("buckets colour identity into one colour, multicolour or colourless", () => {
    expect(cr.colorFacet({ ...base, ci: [] })).toBe("C");
    expect(cr.colorFacet({ ...base, ci: ["R"] })).toBe("R");
    expect(cr.colorFacet({ ...base, ci: ["U", "B"] })).toBe("M");
  });

  it("buckets mana value, capping at 7+", () => {
    expect(cr.cmcFacet({ ...base, cmc: 0 })).toBe("0");
    expect(cr.cmcFacet({ ...base, cmc: 3 })).toBe("3");
    expect(cr.cmcFacet({ ...base, cmc: 6.5 })).toBe("6");
    expect(cr.cmcFacet({ ...base, cmc: 7 })).toBe("7+");
    expect(cr.cmcFacet({ ...base, cmc: 16 })).toBe("7+");
  });

  it("counts lands as Lands, except land creatures; MDFCs go by their front face", () => {
    expect(cr.balanceRow({ ...base, type: "Land", ci: ["G"] })).toBe("L");
    expect(cr.balanceRow({ ...base, type: "Land Creature — Forest", ci: ["G"] })).toBe("G");
    expect(cr.balanceRow({ ...base, type: "Sorcery // Land", ci: ["R"], faces: [{ name: "A", type: "Sorcery" }, { name: "B", type: "Land" }] })).toBe("R");
  });

  it("orders history events chronologically (an add before a cut on the same day) and finds the latest change", () => {
    const e = { id: "x", adds: ["2025-03-01", "2026-01-10"], removes: ["2025-09-01", "2026-01-10"], current: true };
    expect(cr.historyEvents(e)).toEqual([
      { kind: "add", date: "2025-03-01" },
      { kind: "cut", date: "2025-09-01" },
      { kind: "add", date: "2026-01-10" },
      { kind: "cut", date: "2026-01-10" },
    ]);
    expect(cr.lastChange(e)).toBe("2026-01-10");
    expect(cr.lastChange({ id: "y", adds: [], removes: [], current: false })).toBe("");
  });
});
