export type Color = "W" | "U" | "B" | "R" | "G";

export interface CubeCard {
  name: string;
  mana_cost: string;
  cmc: number;
  colors: Color[];
  color_identity: Color[];
  type_line: string;
  image_url: string | null;
  image_url_back: string | null;
  scryfall_id: string;
  set: string;
  collector_number: string;
}

export interface Cube {
  id: string;
  name: string;
  generated_at: string;
  cards: CubeCard[];
  /** Lines from the source list that failed to resolve. Optional for older cubes. */
  failures?: ParseFailure[];
  /** True for the bundled cube we ship with the app. */
  isDefault?: boolean;
  /**
   * Soft-delete marker. Archived cubes are hidden from the main UI by
   * default. There is no UI for permanent deletion — that's intentional.
   */
  archived?: boolean;
}

/** Compact cube info returned by /api/sync GET — enough to render the list. */
export interface CubeMetaEntry {
  id: string;
  name: string;
  cardCount: number;
  archived: boolean;
  lastModified: string;
}

export interface ParseFailure {
  line: string;
  reason: string;
}

export interface ParsedLine {
  raw: string;
  name: string;
  set: string | null;
  collectorNumber: string | null;
}

export interface CubeSession {
  pickedCardIds: string[];
  lastUpdated: string;
}

/** What we save in `cube.json` (legacy/bundled shape). */
export interface BundledCubeData {
  generated_at: string;
  card_count: number;
  cards: CubeCard[];
}

export type GenerationMode = "random" | "color-balanced";

export type EnrichmentStatus =
  | { kind: "idle" }
  | {
      kind: "running";
      done: number;
      total: number;
      currentName: string;
    }
  | {
      kind: "done";
      successes: number;
      failures: ParseFailure[];
    }
  | { kind: "error"; message: string };
