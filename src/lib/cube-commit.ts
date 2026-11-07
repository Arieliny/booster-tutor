/**
 * Committing the Cube review decisions to the sites that hold the lists.
 * Neither Cube Cobra nor Moxfield lets an app edit a list, so this prepares
 * exactly what each one's own bulk tool takes, and Ari pastes or uploads it.
 *
 * Cube Cobra: List -> Edit -> Import -> "Replace with CSV Upload". Read from
 * Cube Cobra's source (2026-11-07): a replace is a diff keyed on the printing
 * (set + collector number). Rows that match a card already in the cube leave it
 * untouched (status, finish, tags, notes kept); missing rows are removed; new
 * rows are added; and a board with no rows is EMPTIED, so every board the cube
 * has (mainboard, maybeboard, basics) goes in the file. Nothing is saved until
 * its Confirm Import page's Save Changes.
 *
 * Moxfield: the deck's Bulk Edit takes "1 Card Name (SET) 123" lines.
 */

/** One card in Cube Cobra's /cube/api/cubeJSON/{id} (the fields used here). */
export interface CobraCard {
  cardID: string;
  status?: string;
  finish?: string;
  tags?: string[];
  notes?: string;
  details?: { name?: string; set?: string; collector_number?: string; oracle_id?: string };
}

export interface CobraCube {
  id: string;
  shortId?: string;
  name?: string;
  /** By board: mainboard, maybeboard, basics... */
  cards: Record<string, unknown>;
}

/** A card to add, with the printing to add it as. */
export interface CommitAdd {
  oracleId: string;
  name: string;
  set: string;
  collectorNumber: string;
}

export interface CommitPlan {
  csv: string;
  /** Mainboard cards before and after. */
  before: number;
  after: number;
  removed: { oracleId: string; name: string; copies: number }[];
  added: CommitAdd[];
  /** Cuts Cube Cobra doesn't have (already cut there). */
  cutsNotThere: string[];
  /** Adds Cube Cobra already has (already added there). */
  addsAlreadyThere: string[];
}

/** Cube Cobra's own CSV export header (serverutils/cube.ts), so the file reads like one of its exports. */
export const COBRA_CSV_HEADER = [
  "name",
  "CMC",
  "Type",
  "Color",
  "Set",
  "Collector Number",
  "Rarity",
  "Color Category",
  "status",
  "Finish",
  "board",
  "maybeboard",
  "image URL",
  "image Back URL",
  "tags",
  "Notes",
  "MTGO ID",
  "Custom",
  "Voucher",
  "Artist",
] as const;

const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;

function row(r: { name: string; set: string; num: string; status?: string; finish?: string; board: string; tags?: string[]; notes?: string }): string {
  const v: Record<(typeof COBRA_CSV_HEADER)[number], string> = {
    name: r.name,
    CMC: "",
    Type: "",
    Color: "",
    Set: r.set,
    "Collector Number": r.num,
    Rarity: "",
    "Color Category": "",
    status: r.status || "Not Owned",
    Finish: r.finish === "Foil" || r.finish === "Etched" ? r.finish : "Non-foil",
    board: r.board,
    maybeboard: r.board === "maybeboard" ? "true" : "false",
    "image URL": "",
    "image Back URL": "",
    tags: (r.tags ?? []).join(";"),
    Notes: r.notes ?? "",
    "MTGO ID": "",
    Custom: "",
    Voucher: "",
    Artist: "",
  };
  return COBRA_CSV_HEADER.map((h) => cell(v[h])).join(",");
}

const boards = (cube: CobraCube): [string, CobraCard[]][] =>
  Object.entries(cube.cards ?? {}).filter((e): e is [string, CobraCard[]] => Array.isArray(e[1]));

/**
 * The replacement CSV for a cube: every card on every board as it is, minus
 * every copy of each cut (mainboard only), plus each add on the mainboard.
 * Throws if a card has no printing to write (the file would remove it).
 */
export function planCubeCobraCommit(cube: CobraCube, cuts: Set<string>, adds: CommitAdd[]): CommitPlan {
  const lines = [COBRA_CSV_HEADER.join(",")];
  const main = boards(cube).find(([b]) => b === "mainboard")?.[1] ?? [];
  const inMain = new Set(main.map((c) => c.details?.oracle_id).filter(Boolean) as string[]);
  const removed = new Map<string, { oracleId: string; name: string; copies: number }>();
  for (const [board, cards] of boards(cube)) {
    for (const c of cards) {
      const d = c.details ?? {};
      if (!d.set || !d.collector_number || !d.name) throw new Error(`Cube Cobra didn't say which printing ${d.name ?? c.cardID} is, so the file would remove it.`);
      if (board === "mainboard" && d.oracle_id && cuts.has(d.oracle_id)) {
        const r = removed.get(d.oracle_id) ?? { oracleId: d.oracle_id, name: d.name, copies: 0 };
        r.copies++;
        removed.set(d.oracle_id, r);
        continue;
      }
      lines.push(row({ name: d.name, set: d.set, num: d.collector_number, status: c.status, finish: c.finish, board, tags: c.tags, notes: c.notes }));
    }
  }
  const added: CommitAdd[] = [];
  const addsAlreadyThere: string[] = [];
  for (const a of adds) {
    if (inMain.has(a.oracleId)) {
      addsAlreadyThere.push(a.name);
      continue;
    }
    added.push(a);
    lines.push(row({ name: a.name, set: a.set, num: a.collectorNumber, board: "mainboard" }));
  }
  const cutsNotThere = [...cuts].filter((id) => !removed.has(id));
  const copiesRemoved = [...removed.values()].reduce((n, r) => n + r.copies, 0);
  return {
    csv: lines.join("\r\n") + "\r\n",
    before: main.length,
    after: main.length - copiesRemoved + added.length,
    removed: [...removed.values()].sort((a, b) => a.name.localeCompare(b.name)),
    added: added.sort((a, b) => a.name.localeCompare(b.name)),
    cutsNotThere,
    addsAlreadyThere,
  };
}

/**
 * Lines for a Moxfield deck's Bulk Edit: "1 Name", with "(SET) 123" and "*F*"
 * when the checklist knows the set code (a pasted Moxfield or Arena-style list).
 */
export function moxfieldLines(entries: { name: string; qty?: number; printing?: string }[]): string {
  return entries
    .map(({ name, qty, printing }) => {
      const m = printing?.match(/^([A-Z0-9]{2,6})(?: #(\S+))?(, foil)?$/);
      const set = m ? ` (${m[1]})${m[2] ? ` ${m[2]}` : ""}${m[3] ? " *F*" : ""}` : "";
      return `${qty && qty > 1 ? qty : 1} ${name}${set}`;
    })
    .join("\n");
}
