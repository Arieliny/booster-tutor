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

export interface CubeData {
  generated_at: string;
  card_count: number;
  cards: CubeCard[];
}

export type GenerationMode = "random" | "color-balanced" | "power-weighted";

export interface PersistedState {
  pickedCardIds: string[];
  lastUpdated: string;
}
