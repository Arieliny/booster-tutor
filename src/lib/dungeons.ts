/**
 * The dungeons, room by room, with each room's effect as printed (Oracle text
 * from Scryfall, October 2026). `next` is where a room leads; `rows` lays the
 * map out top to bottom.
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
    [["Trapped Entry"], ["Veils of Fear", "Oubliette"], ["Sandfall Cell"], ["Cradle of the Death God"]],
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

/** What the initiative does, for the tracker. */
export const INITIATIVE_TEXT =
  "Whenever one or more creatures a player controls deal combat damage to you, that player takes the initiative. Whenever you take the initiative and at the beginning of your upkeep, venture into Undercity.";
