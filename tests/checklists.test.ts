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

describe("importing the CubeOrdering files", () => {
  it("reads the card-by-card order CSV: quoted commas, cube, source, printing, condition, quantity", () => {
    const csv = [
      "﻿Cube,Card,Qty,Source,Printing,Condition,Price (CAD),Store ID / link,Note",
      'Powered,"Bilbo, Luckwearer // Burglar\'s Plot",1,Face to Face (in cart),The Hobbit #32,NM,0.49,variant 1,',
      'Powered,Blazing Rootwalla,1,Face to Face (in cart),"Retro Frame, Modern Horizons 2 #404",NM,0.49,variant 2,',
      "Pauper,Giant's Boulder,7,Face to Face (in cart),Foundations #12,NM,0.10,variant 3,",
      "Powered,Archon of Emeria,1,MPC proxy order #3,,,,Archon of Emeria.png,",
      "Powered,Geist of Saint Thalia,1,From a friend,,,0.00,,",
    ].join("\r\n");
    const rows = cl.parseList(csv);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ name: "Bilbo, Luckwearer // Burglar's Plot", qty: 1, printing: "The Hobbit #32", condition: "NM", from: "Face to Face", group: "Powered" });
    expect(rows[1].printing).toBe("Retro Frame, Modern Horizons 2 #404");
    expect(rows[3]).toEqual({ name: "Archon of Emeria", qty: 1, from: "MPC proxy order #3", group: "Powered" });
    const { names, details } = cl.mergeRows(rows);
    expect(names).toHaveLength(5);
    expect(details[cl.nameKey("Giant's Boulder")]).toEqual({ qty: 7, printing: "Foundations #12", condition: "NM", from: "Face to Face" });
    // One copy is the default and isn't stored.
    expect(details[cl.nameKey("Archon of Emeria")]).toEqual({ from: "MPC proxy order #3" });
  });

  it("reads store cart snapshots", () => {
    const cart = [
      "1|Basking Rootwalla [121] [Torment]|PL|0.79|51739379990900",
      "1|Blazing Rootwalla [404] [Retro Frame] [Modern Horizons 2]|NM|0.49|51735833248116",
      "1|Young Blue Dragon // Sand Augury [Commander Legends: Battle for Baldur's Gate]|Hero Deal|0.45|8479679|magic_singles/x",
    ].join("\n");
    const rows = cl.parseList(cart);
    expect(rows[0]).toEqual({ name: "Basking Rootwalla", qty: 1, printing: "Torment #121", condition: "PL" });
    expect(rows[1].printing).toBe("Retro Frame, Modern Horizons 2 #404");
    // Topdeck Hero's price tier isn't a condition.
    expect(rows[2]).toEqual({ name: "Young Blue Dragon // Sand Augury", qty: 1, printing: "Commander Legends: Battle for Baldur's Gate" });
  });

  it("reads an MPC proxy order: fronts only, copies from the slots", () => {
    const xml = `<order><details><quantity>3</quantity></details><fronts>
      <card><id>a</id><slots>0,1</slots><name>Bazaar of Baghdad.png</name><query>bazaar of baghdad</query></card>
      <card><id>b</id><slots>2</slots><name>Jace, the Mind Sculptor (Artist).jpg</name></card>
    </fronts><backs><card><id>c</id><slots>0</slots><name>Back.png</name></card></backs><cardback>x</cardback></order>`;
    expect(cl.parseList(xml)).toEqual([
      { name: "Bazaar of Baghdad", qty: 2, from: "MPC proxy" },
      { name: "Jace, the Mind Sculptor", from: "MPC proxy" },
    ]);
  });

  it("keeps a plain list's set, collector number and foil as the printing", () => {
    expect(cl.parseList("2x Swords to Plowshares (sta) 10 *F*")).toEqual([{ name: "Swords to Plowshares", qty: 2, printing: "STA #10, foil" }]);
  });

  it("stores only the details of the cards a checklist keeps", () => {
    const { names, details } = cl.mergeRows(cl.parseList("2 Lightning Bolt (LEA) 161\nCounterspell"));
    const id = cl.createChecklist("Order", { kind: "names", names, details });
    const src = cl.loadChecklists().lists.find((l) => l.id === id)!.source;
    expect(src).toEqual({ kind: "names", names: ["Lightning Bolt", "Counterspell"], details: { "lightning bolt": { qty: 2, printing: "LEA #161" } } });
  });
});
