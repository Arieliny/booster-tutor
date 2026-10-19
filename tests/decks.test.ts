import { describe, expect, it } from "vitest";
import { addDecks, deal, deleteDeck, listDecks, renameDeck, setActive, type DeckMap } from "../src/lib/decks";

let n = 0;
const id = () => `d${++n}`;

describe("deck list", () => {
  it("adds one per line, skipping blanks and names already there (any case)", () => {
    const { map, added } = addDecks({}, "Mono Red\n\n  Azorius   Control \nmono red\nGolgari", 1, id);
    expect(added).toBe(3);
    expect(listDecks(map).map((d) => d.name)).toEqual(["Azorius Control", "Golgari", "Mono Red"]);
    expect(addDecks(map, "GOLGARI", 2, id).added).toBe(0);
  });

  it("renames, toggles the pool and deletes with a stamped tombstone", () => {
    let map: DeckMap = addDecks({}, "Elves", 1, () => "e").map;
    map = renameDeck(map, "e", "  Elves  Combo ", 2);
    expect(map.e).toMatchObject({ name: "Elves Combo", t: 2 });
    map = setActive(map, "e", false, 3);
    expect(map.e).toMatchObject({ active: false, t: 3 });
    map = deleteDeck(map, "e", 4);
    expect(map.e).toMatchObject({ deleted: true, t: 4 });
    expect(listDecks(map)).toEqual([]);
  });

  it("a deleted name can be added again", () => {
    let map: DeckMap = addDecks({}, "Burn", 1, () => "b").map;
    map = deleteDeck(map, "b", 2);
    expect(addDecks(map, "Burn", 3, () => "b2").added).toBe(1);
  });
});

describe("deal", () => {
  it("gives every seat a different deck from the pool", () => {
    const pool = ["A", "B", "C", "D", "E"];
    for (let k = 0; k < 50; k++) {
      const hands = deal(pool, 4);
      expect(new Set(hands).size).toBe(4);
      for (const h of hands) expect(pool).toContain(h);
    }
  });

  it("needs at least as many decks as players", () => {
    expect(deal(["A"], 2)).toEqual([]);
    expect(deal(["A", "B"], 2).sort()).toEqual(["A", "B"]);
  });

  it("is a fair pick (every deck can land on seat 1)", () => {
    const seen = new Set<string>();
    for (let k = 0; k < 200; k++) seen.add(deal(["A", "B", "C"], 2)[0]);
    expect([...seen].sort()).toEqual(["A", "B", "C"]);
  });
});

describe("deck lists", () => {
  it("starts with one list, 'My decks', holding decks saved before lists existed", async () => {
    const { listLists, DEFAULT_LIST } = await import("../src/lib/decks");
    expect(listLists({}).map((l) => [l.id, l.name])).toEqual([[DEFAULT_LIST, "My decks"]]);
    const old: DeckMap = { a: { t: 1, name: "Old deck", active: true } };
    expect(listDecks(old, DEFAULT_LIST).map((d) => d.name)).toEqual(["Old deck"]);
  });

  it("adds lists (no duplicate names), keeps decks per list, and the same name can be in two lists", async () => {
    const { addList, listLists } = await import("../src/lib/decks");
    const made = addList({}, "Commander", 1, () => "cmd");
    expect(made.id).toBe("cmd");
    expect(addList(made.lists, "commander", 2, () => "x").id).toBeNull();
    expect(listLists(made.lists).map((l) => l.name)).toEqual(["Commander", "My decks"]);
    let decks: DeckMap = addDecks({}, "Atraxa\nKrenko", 1, id, "cmd").map;
    decks = addDecks(decks, "Krenko", 2, id).map; // same name, starting list
    expect(listDecks(decks, "cmd").map((d) => d.name)).toEqual(["Atraxa", "Krenko"]);
    expect(listDecks(decks).map((d) => d.name)).toEqual(["Krenko"]);
  });

  it("renames (including the starting list) and deleting a list deletes its decks", async () => {
    const { addList, renameList, deleteList, listLists, DEFAULT_LIST } = await import("../src/lib/decks");
    let lists = renameList({}, DEFAULT_LIST, "Pauper cube", 1);
    expect(listLists(lists).map((l) => l.name)).toEqual(["Pauper cube"]);
    lists = addList(lists, "Jumpstart", 2, () => "js").lists;
    const decks = addDecks({}, "Goblins\nPirates", 3, id, "js").map;
    const after = deleteList(lists, decks, "js", 4);
    expect(listLists(after.lists).map((l) => l.name)).toEqual(["Pauper cube"]);
    expect(listDecks(after.decks, "js")).toEqual([]);
    expect(Object.values(after.decks).every((d) => d.deleted && d.t === 4)).toBe(true);
  });
});
