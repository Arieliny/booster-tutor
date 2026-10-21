/**
 * The dungeons, room by room, with each room's effect as printed (Oracle text
 * from Scryfall, October 2026). `next` is where a room leads; `rows` lays the
 * map out top to bottom. A room leads into the row below it, or through the
 * row's empty slot ("") when it skips a row (Tomb of Annihilation's Oubliette).
 *
 * Undercity can only be entered through the initiative ("venture into
 * Undercity"); the other three through any "venture into the dungeon".
 */

export type DungeonKey = "undercity" | "lostMine" | "madMage" | "tomb";

export interface Room {
  name: string;
  effect: string;
  next: string[];
}

export interface Dungeon {
  key: DungeonKey;
  name: string;
  note?: string;
  rows: string[][];
  rooms: Record<string, Room>;
}

function dungeon(key: DungeonKey, name: string, rows: string[][], list: Room[], note?: string): Dungeon {
  return { key, name, note, rows, rooms: Object.fromEntries(list.map((r) => [r.name, r])) };
}

export const DUNGEONS: Dungeon[] = [
  dungeon(
    "undercity",
    "Undercity",
    [["Secret Entrance"], ["Forge", "Lost Well"], ["Trap!", "Arena", "Stash"], ["Archives", "Catacombs"], ["Throne of the Dead Three"]],
    [
      { name: "Secret Entrance", effect: "Search your library for a basic land card, reveal it, put it into your hand, then shuffle.", next: ["Forge", "Lost Well"] },
      { name: "Forge", effect: "Put two +1/+1 counters on target creature.", next: ["Trap!", "Arena"] },
      { name: "Lost Well", effect: "Scry 2.", next: ["Arena", "Stash"] },
      { name: "Trap!", effect: "Target player loses 5 life.", next: ["Archives"] },
      { name: "Arena", effect: "Goad target creature.", next: ["Archives", "Catacombs"] },
      { name: "Stash", effect: "Create a Treasure token.", next: ["Catacombs"] },
      { name: "Archives", effect: "Draw a card.", next: ["Throne of the Dead Three"] },
      { name: "Catacombs", effect: "Create a 4/1 black Skeleton creature token with menace.", next: ["Throne of the Dead Three"] },
      {
        name: "Throne of the Dead Three",
        effect:
          "Reveal the top ten cards of your library. Put a creature card from among them onto the battlefield with three +1/+1 counters on it. It gains hexproof until your next turn. Then shuffle.",
        next: [],
      },
    ],
    "Only through the initiative",
  ),
  dungeon(
    "lostMine",
    "Lost Mine of Phandelver",
    [["Cave Entrance"], ["Goblin Lair", "Mine Tunnels"], ["Storeroom", "Dark Pool", "Fungi Cavern"], ["Temple of Dumathoin"]],
    [
      { name: "Cave Entrance", effect: "Scry 1.", next: ["Goblin Lair", "Mine Tunnels"] },
      { name: "Goblin Lair", effect: "Create a 1/1 red Goblin creature token.", next: ["Storeroom", "Dark Pool"] },
      { name: "Mine Tunnels", effect: "Create a Treasure token.", next: ["Dark Pool", "Fungi Cavern"] },
      { name: "Storeroom", effect: "Put a +1/+1 counter on target creature.", next: ["Temple of Dumathoin"] },
      { name: "Dark Pool", effect: "Each opponent loses 1 life and you gain 1 life.", next: ["Temple of Dumathoin"] },
      { name: "Fungi Cavern", effect: "Target creature gets -4/-0 until your next turn.", next: ["Temple of Dumathoin"] },
      { name: "Temple of Dumathoin", effect: "Draw a card.", next: [] },
    ],
  ),
  dungeon(
    "madMage",
    "Dungeon of the Mad Mage",
    [["Yawning Portal"], ["Dungeon Level"], ["Goblin Bazaar", "Twisted Caverns"], ["Lost Level"], ["Runestone Caverns", "Muiral's Graveyard"], ["Deep Mines"], ["Mad Wizard's Lair"]],
    [
      { name: "Yawning Portal", effect: "You gain 1 life.", next: ["Dungeon Level"] },
      { name: "Dungeon Level", effect: "Scry 1.", next: ["Goblin Bazaar", "Twisted Caverns"] },
      { name: "Goblin Bazaar", effect: "Create a Treasure token.", next: ["Lost Level"] },
      { name: "Twisted Caverns", effect: "Target creature can't attack until your next turn.", next: ["Lost Level"] },
      { name: "Lost Level", effect: "Scry 2.", next: ["Runestone Caverns", "Muiral's Graveyard"] },
      { name: "Runestone Caverns", effect: "Exile the top two cards of your library. You may play them.", next: ["Deep Mines"] },
      { name: "Muiral's Graveyard", effect: "Create two 1/1 black Skeleton creature tokens.", next: ["Deep Mines"] },
      { name: "Deep Mines", effect: "Scry 3.", next: ["Mad Wizard's Lair"] },
      { name: "Mad Wizard's Lair", effect: "Draw three cards and reveal them. You may cast one of them without paying its mana cost.", next: [] },
    ],
  ),
  dungeon(
    "tomb",
    "Tomb of Annihilation",
    [["Trapped Entry"], ["Veils of Fear", "Oubliette"], ["Sandfall Cell", ""], ["Cradle of the Death God"]],
    [
      { name: "Trapped Entry", effect: "Each player loses 1 life.", next: ["Veils of Fear", "Oubliette"] },
      { name: "Veils of Fear", effect: "Each player loses 2 life unless they discard a card.", next: ["Sandfall Cell"] },
      { name: "Sandfall Cell", effect: "Each player loses 2 life unless they sacrifice a creature, artifact, or land of their choice.", next: ["Cradle of the Death God"] },
      { name: "Oubliette", effect: "Discard a card and sacrifice a creature, an artifact, and a land.", next: ["Cradle of the Death God"] },
      { name: "Cradle of the Death God", effect: "Create The Atropal, a legendary 4/4 black God Horror creature token with deathtouch.", next: [] },
    ],
  ),
];

export const dungeonOf = (key: DungeonKey): Dungeon => DUNGEONS.find((d) => d.key === key)!;
export const firstRoom = (key: DungeonKey): string => dungeonOf(key).rows[0][0];
export const isLastRoom = (key: DungeonKey, room: string): boolean => dungeonOf(key).rooms[room]?.next.length === 0;

/** Every room still reachable from `room` (not counting the room itself). */
export function roomsAhead(d: Dungeon, room: string): Set<string> {
  const seen = new Set<string>();
  const walk = (r: string) =>
    d.rooms[r]?.next.forEach((n) => {
      if (!seen.has(n)) {
        seen.add(n);
        walk(n);
      }
    });
  walk(room);
  return seen;
}

/**
 * An arrow on the map from slot `from` in row `row` straight down to slot `to`
 * in the row below, for the move `a` → `b`. It sits at `x` (% across the
 * map), in the middle of where the two rooms overlap, so it never runs
 * sideways. A move that skips a row goes through the empty slot in between:
 * the first half (`into` false) ends there without an arrowhead.
 */
export interface MapLink {
  row: number;
  from: number;
  to: number;
  x: number;
  into: boolean;
  a: string;
  b: string;
}

/** Where an arrow goes between slot `from` of `fromOf` and slot `to` of `toOf`. */
function arrowX(from: number, fromOf: number, to: number, toOf: number): number {
  const left = Math.max(from / fromOf, to / toOf);
  const right = Math.min((from + 1) / fromOf, (to + 1) / toOf);
  // Rooms that don't overlap (none on the printed dungeons) get the point between their middles.
  return (right > left ? (left + right) / 2 : ((from + 0.5) / fromOf + (to + 0.5) / toOf) / 2) * 100;
}

export function mapLinks(d: Dungeon): MapLink[] {
  const links: MapLink[] = [];
  d.rows.forEach((row, r) => {
    const below = d.rows[r + 1];
    if (!below) return;
    row.forEach((a, from) => {
      for (const b of d.rooms[a]?.next ?? []) {
        const to = below.indexOf(b);
        if (to >= 0) {
          links.push({ row: r, from, to, x: arrowX(from, row.length, to, below.length), into: true, a, b });
          continue;
        }
        const gap = below.indexOf("");
        const end = d.rows[r + 2]?.indexOf(b) ?? -1;
        if (gap < 0 || end < 0) continue;
        links.push({ row: r, from, to: gap, x: arrowX(from, row.length, gap, below.length), into: false, a, b });
        links.push({ row: r + 1, from: gap, to: end, x: arrowX(gap, below.length, end, d.rows[r + 2].length), into: true, a, b });
      }
    });
  });
  return links;
}

/** What the initiative does, for the tracker. */
export const INITIATIVE_TEXT =
  "Whenever one or more creatures a player controls deal combat damage to you, that player takes the initiative. Whenever you take the initiative and at the beginning of your upkeep, venture into Undercity.";
