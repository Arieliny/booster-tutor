import { describe, expect, it } from "vitest";
import { COBRA_CSV_HEADER, moxfieldLines, planCubeCobraCommit, type CobraCube } from "../src/lib/cube-commit";
import { listHash, staleReasons } from "../api/_data-version.js";

const card = (oracle: string, name: string, set: string, num: string, extra: Record<string, unknown> = {}) => ({
  cardID: `sid-${oracle}`,
  status: "Not Owned",
  details: { name, set, collector_number: num, oracle_id: oracle },
  ...extra,
});

const cube: CobraCube = {
  id: "uuid",
  shortId: "TestCube",
  cards: {
    mainboard: [
      card("o-bolt", "Lightning Bolt", "lea", "161"),
      card("o-bilbo", "Bilbo, Luckwearer // Burglar's Plot", "ltr", "32", { status: "Proxied", tags: ["aggro", "red"], notes: 'say "hi"' }),
      card("o-dup", "Brainstorm", "ice", "61"),
      card("o-dup", "Brainstorm", "ice", "61"),
    ],
    maybeboard: [],
    basics: [card("o-forest", "Forest", "unh", "140", { status: undefined })],
    id: "not a board",
  },
};

/** The CSV back into rows (quoted cells, "" for a quote). */
function rows(csv: string): Record<string, string>[] {
  const lines = csv.trim().split("\r\n");
  const parse = (l: string) => [...l.matchAll(/"((?:[^"]|"")*)"|([^,]+)/g)].map((m) => (m[1] ?? m[2]).replace(/""/g, '"'));
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => Object.fromEntries(parse(l).map((v, i) => [head[i], v])));
}

describe("the Cube Cobra replacement file", () => {
  it("keeps every card on every board as it is when nothing changes", () => {
    const plan = planCubeCobraCommit(cube, new Set(), []);
    const r = rows(plan.csv);
    expect(plan.csv.split("\r\n")[0]).toBe(COBRA_CSV_HEADER.join(","));
    expect(r).toHaveLength(5);
    expect(r.filter((x) => x.board === "basics").map((x) => x.name)).toEqual(["Forest"]);
    expect(r[1]).toMatchObject({ name: "Bilbo, Luckwearer // Burglar's Plot", Set: "ltr", "Collector Number": "32", status: "Proxied", tags: "aggro;red", Notes: 'say "hi"' });
    expect(plan.before).toBe(4);
    expect(plan.after).toBe(4);
    expect(plan.removed).toEqual([]);
  });

  it("drops every copy of a cut, adds the adds, and reports what's already done", () => {
    const plan = planCubeCobraCommit(
      cube,
      new Set(["o-dup", "o-gone"]),
      [
        { oracleId: "o-new", name: "Counterspell", set: "lea", collectorNumber: "54" },
        { oracleId: "o-bolt", name: "Lightning Bolt", set: "lea", collectorNumber: "161" },
      ],
    );
    const names = rows(plan.csv).map((x) => x.name);
    expect(names).toEqual(["Lightning Bolt", "Bilbo, Luckwearer // Burglar's Plot", "Forest", "Counterspell"]);
    expect(plan.removed).toEqual([{ oracleId: "o-dup", name: "Brainstorm", copies: 2 }]);
    expect(plan.added.map((a) => a.name)).toEqual(["Counterspell"]);
    expect(plan.addsAlreadyThere).toEqual(["Lightning Bolt"]);
    expect(plan.cutsNotThere).toEqual(["o-gone"]);
    expect(plan.before).toBe(4);
    expect(plan.after).toBe(3);
    // New cards go on the mainboard as plain, unowned, non-foil copies.
    expect(rows(plan.csv).at(-1)).toMatchObject({ board: "mainboard", status: "Not Owned", Finish: "Non-foil", maybeboard: "false" });
  });

  it("refuses to write a file that would silently drop a card it can't name a printing for", () => {
    const broken: CobraCube = { id: "x", cards: { mainboard: [{ cardID: "sid", details: { name: "Mystery" } }] } };
    expect(() => planCubeCobraCommit(broken, new Set(), [])).toThrow(/Mystery/);
  });
});

describe("the Moxfield list", () => {
  it("writes '1 Name', keeping a set code, number and foil it knows", () => {
    expect(
      moxfieldLines([
        { name: "Counterspell" },
        { name: "Giant's Boulder", qty: 7, printing: "The Hobbit #173" },
        { name: "Swords to Plowshares", qty: 2, printing: "STA #10, foil" },
        { name: "Brainstorm", printing: "ICE" },
      ]),
    ).toBe(["1 Counterspell", "7 Giant's Boulder", "2 Swords to Plowshares (STA) 10 *F*", "1 Brainstorm (ICE)"].join("\n"));
  });
});

describe("watching Cube Cobra", () => {
  it("fingerprints a card list regardless of order and repeats", () => {
    expect(listHash(["b", "a", "a"])).toBe(listHash(["a", "b"]));
    expect(listHash(["a", "b"])).not.toBe(listHash(["a", "c"]));
    expect(listHash(["a", "b"]).startsWith("2-")).toBe(true);
  });

  it("calls the deploy stale when the cube changed, and not when it couldn't tell", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const version = { builtAt: "2026-11-07T00:00:00Z", cards: { total: 100 }, cr: { source: "cr" }, mine: { hash: "547-x" } };
    const live = { total: 100, crSource: "cr" };
    expect(staleReasons(version, { ...live, mine: "547-x" }, now)).toEqual([]);
    expect(staleReasons(version, { ...live, mine: null }, now)).toEqual([]);
    expect(staleReasons(version, { ...live, mine: "550-y" }, now)).toEqual(["your Cube Cobra cube changed"]);
  });

  it("watches LSV, MTGO and Arena too, by name", () => {
    const now = new Date("2026-11-12T12:00:00Z");
    const version = {
      builtAt: "2026-11-12T00:00:00Z",
      cards: { total: 100 },
      cr: { source: "cr" },
      mine: { hash: "547-x" },
      cubes: { mine: { hash: "547-x", label: "My cube" }, lsv: { hash: "525-a", label: "LSV" }, mtgo: { hash: "540-m", label: "MTGO Vintage" } },
    };
    const live = { total: 100, crSource: "cr" };
    expect(staleReasons(version, { ...live, cubes: { mine: "547-x", lsv: "525-a", mtgo: null } }, now)).toEqual([]);
    expect(staleReasons(version, { ...live, cubes: { mine: "547-x", lsv: "528-b", mtgo: "540-m" } }, now)).toEqual([
      "LSV's cube changed on Cube Cobra",
    ]);
    expect(staleReasons(version, { ...live, cubes: { mine: "548-z", lsv: "525-a" } }, now)).toEqual(["your Cube Cobra cube changed"]);
  });
});
