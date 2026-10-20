import { describe, expect, it } from "vitest";
import {
  COUNTERS,
  MERGE_MS,
  addCounter,
  changeCmdr,
  changeCounter,
  changeLife,
  lifeAfter,
  newGame,
  parseGame,
  removeCounter,
  rollDice,
  setColor,
  setLife,
  toggleMarker,
  undo,
  untouched,
} from "../src/lib/life";

const T = 1_000_000;

describe("newGame", () => {
  it("seats 2-6 players at the starting life, clamping the count", () => {
    expect(newGame(4, 20).players.map((p) => p.life)).toEqual([20, 20, 20, 20]);
    expect(newGame(1, 20).players).toHaveLength(2);
    expect(newGame(9, 40).players).toHaveLength(6);
  });

  it("keeps each seat's color from the previous game", () => {
    const g = setColor(newGame(2, 20), 1, "gold");
    expect(newGame(3, 20, g).players.map((p) => p.color)).toEqual(["blue", "gold", "green"]);
  });
});

describe("life changes and history", () => {
  it("merges quick taps on the same player into one entry", () => {
    let g = newGame(2, 20);
    g = changeLife(g, 0, -1, T);
    g = changeLife(g, 0, -1, T + 500);
    g = changeLife(g, 0, -1, T + 1000);
    expect(g.players[0].life).toBe(17);
    expect(g.history).toHaveLength(1);
    expect(g.history[0].d).toBe(-3);
  });

  it("starts a new entry after a pause, or for another player", () => {
    let g = newGame(2, 20);
    g = changeLife(g, 0, -1, T);
    g = changeLife(g, 0, -1, T + MERGE_MS + 1);
    g = changeLife(g, 1, 2, T + MERGE_MS + 2);
    expect(g.history.map((e) => [e.p, e.d])).toEqual([
      [0, -1],
      [0, -1],
      [1, 2],
    ]);
  });

  it("undo takes back a whole merged run", () => {
    let g = newGame(2, 20);
    g = changeLife(g, 1, -5, T);
    g = changeLife(g, 0, -1, T + 1);
    g = changeLife(g, 0, -1, T + 2);
    g = undo(g);
    expect(g.players.map((p) => p.life)).toEqual([20, 15]);
    g = undo(g);
    expect(g.players.map((p) => p.life)).toEqual([20, 20]);
    expect(undo(g)).toBe(g);
  });

  it("setLife records the exact total and undoes back", () => {
    const g = setLife(newGame(2, 20), 0, 7, T);
    expect(g.players[0].life).toBe(7);
    expect(g.history[0].kind).toBe("set");
    expect(undo(g).players[0].life).toBe(20);
    expect(setLife(g, 0, 7, T + 1)).toBe(g); // no change, no entry
  });

  it("lifeAfter reports each entry's resulting total", () => {
    let g = newGame(2, 20);
    g = changeLife(g, 0, -3, T);
    g = changeLife(g, 0, -2, T + MERGE_MS + 1);
    expect([lifeAfter(g, 0), lifeAfter(g, 1)]).toEqual([17, 15]);
  });

  it("untouched is true until something happens (colors don't count)", () => {
    const g = setColor(newGame(2, 20), 0, "red");
    expect(untouched(g)).toBe(true);
    expect(untouched(changeLife(g, 0, 1, T))).toBe(false);
  });
});

describe("counters", () => {
  it("adds a counter at 0, changes it, never below 0, and hides it", () => {
    let g = addCounter(newGame(2, 20), 0, "poison");
    expect(g.players[0].counters.poison).toBe(0);
    expect(g.history).toHaveLength(0);
    g = changeCounter(g, 0, "poison", 3, T);
    expect(g.players[0].counters.poison).toBe(3);
    g = changeCounter(g, 0, "poison", -10, T + MERGE_MS + 1);
    expect(g.players[0].counters.poison).toBe(0);
    expect(g.history.at(-1)!.d).toBe(-3);
    g = removeCounter(g, 0, "poison");
    expect(g.players[0].counters.poison).toBeUndefined();
  });

  it("undoing a life change keeps a counter added since", () => {
    let g = changeLife(newGame(2, 20), 0, -2, T);
    g = addCounter(g, 0, "energy");
    g = undo(g);
    expect(g.players[0].life).toBe(20);
    expect(g.players[0].counters.energy).toBe(0);
  });
});

describe("commander damage", () => {
  it("is tracked per source seat and also takes life", () => {
    let g = newGame(4, 40);
    g = changeCmdr(g, 2, 0, 5, T, true);
    g = changeCmdr(g, 2, 3, 4, T + 1, true);
    expect(g.players[2].cmdr).toEqual({ 0: 5, 3: 4 });
    expect(g.players[2].life).toBe(31);
  });

  it("can't go below 0, and undo restores both damage and life", () => {
    let g = changeCmdr(newGame(2, 20), 0, 1, 6, T, true);
    expect(changeCmdr(g, 0, 1, -10, T + MERGE_MS + 1).players[0].cmdr[1]).toBe(0);
    g = undo(g);
    expect(g.players[0].cmdr[1]).toBe(0);
    expect(g.players[0].life).toBe(20);
  });
});

describe("markers", () => {
  it("monarch moves between players and toggles off", () => {
    let g = toggleMarker(newGame(3, 20), 0, "monarch", T);
    expect(g.markers.monarch).toBe(0);
    g = toggleMarker(g, 2, "monarch", T + 1);
    expect(g.markers.monarch).toBe(2);
    g = toggleMarker(g, 2, "monarch", T + 2);
    expect(g.markers.monarch).toBeUndefined();
    g = undo(g);
    expect(g.markers.monarch).toBe(2);
  });
});

describe("rollDice and parseGame", () => {
  it("rolls within range", () => {
    expect(rollDice(3, 6, () => 0)).toEqual([1, 1, 1]);
    expect(rollDice(1, 20, () => 0.9999)).toEqual([20]);
  });

  it("upgrades the old two-player save and rejects junk", () => {
    const g = parseGame({ start: 20, life: [14, 9] })!;
    expect(g.v).toBe(2);
    expect(g.players.map((p) => p.life)).toEqual([14, 9]);
    expect(parseGame(null)).toBeNull();
    expect(parseGame({ v: 2, players: [] })).toBeNull();
    const saved = changeLife(newGame(3, 30), 1, -4, T);
    expect(parseGame(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });
});

describe("giving the monarch and the initiative", () => {
  it("moves the marker to the new holder, and does nothing if they already have it", async () => {
    const { giveMarker } = await import("../src/lib/life");
    let g = giveMarker(newGame(3, 20), 1, "initiative", T);
    expect(g.markers.initiative).toBe(1);
    expect(giveMarker(g, 1, "initiative", T + 1)).toBe(g);
    g = giveMarker(g, 2, "initiative", T + 2);
    expect(g.markers.initiative).toBe(2);
    expect(undo(g).markers.initiative).toBe(1);
  });
});

describe("dungeons", () => {
  it("every room is on the map and every 'leads to' room exists", async () => {
    const { DUNGEONS } = await import("../src/lib/dungeons");
    for (const d of DUNGEONS) {
      const onMap = d.rows.flat();
      expect(new Set(onMap)).toEqual(new Set(Object.keys(d.rooms)));
      for (const r of Object.values(d.rooms)) for (const n of r.next) expect(d.rooms[n], `${d.name}: ${r.name} -> ${n}`).toBeDefined();
      // Exactly one last room, at the bottom of the map.
      const last = Object.values(d.rooms).filter((r) => r.next.length === 0);
      expect(last.map((r) => r.name)).toEqual(d.rows.at(-1));
    }
  });

  it("entering, moving, completing and undoing", async () => {
    const { enterRoom, completeDungeon } = await import("../src/lib/life");
    let g = enterRoom(newGame(2, 20), 0, "undercity", "Secret Entrance", T);
    g = enterRoom(g, 0, "undercity", "Forge", T + 1);
    expect(g.players[0].dungeon).toEqual({ key: "undercity", room: "Forge" });
    expect(completeDungeon(g, 0, T + 2)).toBe(g); // not in the last room yet
    g = enterRoom(g, 0, "undercity", "Trap!", T + 3);
    g = enterRoom(g, 0, "undercity", "Archives", T + 4);
    g = enterRoom(g, 0, "undercity", "Throne of the Dead Three", T + 5);
    g = completeDungeon(g, 0, T + 6);
    expect(g.players[0].dungeon).toBeUndefined();
    expect(g.players[0].completed).toBe(1);
    g = undo(g);
    expect(g.players[0].dungeon?.room).toBe("Throne of the Dead Three");
    expect(g.players[0].completed).toBeUndefined();
    g = undo(undo(undo(undo(g))));
    expect(g.players[0].dungeon?.room).toBe("Secret Entrance");
    expect(undo(g).players[0].dungeon).toBeUndefined();
  });
});

describe("venturing into Undercity takes the initiative", () => {
  it("in one history entry, so a single undo puts back both the room and the initiative", async () => {
    const { enterRoom, giveMarker } = await import("../src/lib/life");
    let g = giveMarker(newGame(2, 20), 1, "initiative", T);
    g = enterRoom(g, 0, "undercity", "Secret Entrance", T + 1, true);
    expect(g.markers.initiative).toBe(0);
    expect(g.players[0].dungeon?.room).toBe("Secret Entrance");
    expect(g.history).toHaveLength(2);
    g = undo(g);
    expect(g.markers.initiative).toBe(1);
    expect(g.players[0].dungeon).toBeUndefined();
  });

  it("other dungeons don't touch the initiative", async () => {
    const { enterRoom } = await import("../src/lib/life");
    const g = enterRoom(newGame(2, 20), 0, "lostMine", "Cave Entrance", T, false);
    expect(g.markers.initiative).toBeUndefined();
  });
});

describe("counter caps", () => {
  it("speed stops at 4", () => {
    let g = changeCounter(newGame(2, 20), 0, "speed", 3, T);
    g = changeCounter(g, 0, "speed", 5, T + MERGE_MS + 1);
    expect(g.players[0].counters.speed).toBe(4);
    expect(changeCounter(g, 0, "speed", 1, T + 2 * MERGE_MS)).toBe(g);
  });
});

describe("counter symbols", () => {
  it("poison shows the Phyrexian symbol by default, can switch, and the choice carries to the next game", async () => {
    const { counterIcon, setCounterIcon } = await import("../src/lib/life");
    let g = newGame(2, 20);
    expect(counterIcon(g, "poison")).toBe("phyrexian");
    expect(counterIcon(g, "energy")).toBe("bolt");
    g = setCounterIcon(g, "poison", "droplet");
    expect(counterIcon(g, "poison")).toBe("droplet");
    expect(g.history).toHaveLength(0);
    expect(counterIcon(newGame(2, 20, g), "poison")).toBe("droplet");
  });
});

describe("commander damage on the card", () => {
  it("shows at 0, keeps showing after damage is undone, and hides", async () => {
    const { addCmdr, removeCmdr } = await import("../src/lib/life");
    let g = addCmdr(newGame(3, 40), 0, 2);
    expect(g.players[0].cmdr).toEqual({ 2: 0 });
    expect(g.history).toHaveLength(0);
    g = changeCmdr(g, 0, 2, 7, T, true);
    expect(g.players[0].life).toBe(33);
    g = undo(g);
    expect(g.players[0].cmdr).toEqual({ 2: 0 });
    expect(g.players[0].life).toBe(40);
    expect(removeCmdr(g, 0, 2).players[0].cmdr).toEqual({});
  });
});

describe("commander damage and life (setting)", () => {
  it("leaves life alone by default, takes it when asked to", async () => {
    const off = changeCmdr(newGame(2, 40), 0, 1, 5, T);
    expect(off.players[0].cmdr[1]).toBe(5);
    expect(off.players[0].life).toBe(40);
    const on = changeCmdr(newGame(2, 40), 0, 1, 5, T, true);
    expect(on.players[0].life).toBe(35);
  });
});

describe("mana counters", () => {
  it("one per color plus colorless, each with its pip", () => {
    const mana = COUNTERS.filter((c) => c.pip);
    expect(mana.map((c) => c.pip)).toEqual(["W", "U", "B", "R", "G", "C"]);
    let g = addCounter(newGame(2, 20), 0, "manaG");
    g = changeCounter(g, 0, "manaG", 3, T);
    expect(g.players[0].counters.manaG).toBe(3);
  });
});

describe("seat colors", () => {
  it("adding players gives the new seats colors nobody has", async () => {
    const { seatColors } = await import("../src/lib/life");
    // Last game: two players who'd picked green and blue.
    const colors = seatColors(4, ["green", "blue"]);
    expect(colors.slice(0, 2)).toEqual(["green", "blue"]);
    expect(new Set(colors).size).toBe(4);
    expect(colors.slice(2)).toEqual(["red", "black"]);
  });

  it("every seat is different even at six players, and an old duplicate gets a free color", async () => {
    const { seatColors, newGame } = await import("../src/lib/life");
    expect(new Set(seatColors(6)).size).toBe(6);
    expect(seatColors(3, ["red", "red", "blue"])).toEqual(["red", "green", "blue"]);
    const prev = newGame(2, 20);
    const next = newGame(6, 40, { ...prev, players: prev.players.map((p) => ({ ...p, color: "gold" as const })) });
    expect(new Set(next.players.map((p) => p.color)).size).toBe(6);
  });

  it("a player can't take a color someone else has", async () => {
    const { setColor } = await import("../src/lib/life");
    const g = newGame(3, 20); // blue, red, green
    expect(setColor(g, 0, "red")).toBe(g);
    expect(setColor(g, 0, "gold").players[0].color).toBe("gold");
  });
});

describe("rows on a life card", () => {
  it("shows at most six, counting counters, unspent mana and commander damage together", async () => {
    const { MAX_TRACKED, addCmdr, trackedCount } = await import("../src/lib/life");
    let g = newGame(4, 40);
    for (const key of ["poison", "energy", "experience", "manaW", "manaU"] as const) g = addCounter(g, 0, key);
    g = addCmdr(g, 0, 1);
    expect(trackedCount(g.players[0])).toBe(MAX_TRACKED);
    // Full: neither another counter nor more commander damage goes on.
    expect(addCounter(g, 0, "manaR")).toBe(g);
    expect(addCmdr(g, 0, 2)).toBe(g);
    // Removing one makes room again.
    g = removeCounter(g, 0, "energy");
    expect(trackedCount(addCounter(g, 0, "manaR").players[0])).toBe(MAX_TRACKED);
  });
});
