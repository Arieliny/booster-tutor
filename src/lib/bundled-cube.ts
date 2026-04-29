import bundled from "../data/cube.json";
import type { BundledCubeData, Cube } from "../types";

const BUNDLED_CUBE_ID = "bundled-aris-cube";

export function loadBundledCube(): Cube {
  const data = bundled as BundledCubeData;
  return {
    id: BUNDLED_CUBE_ID,
    name: "Ari's Cube",
    generated_at: data.generated_at,
    cards: data.cards,
    isDefault: true,
  };
}

export const BUNDLED_CUBE_KEY = BUNDLED_CUBE_ID;
