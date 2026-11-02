import { describe, expect, it } from "vitest";
import { parseAppearance, resolveAppearance } from "../src/lib/appearance";

describe("appearance", () => {
  it("reads a saved choice and falls back to following the phone", () => {
    expect(parseAppearance("light")).toBe("light");
    expect(parseAppearance("dark")).toBe("dark");
    expect(parseAppearance("system")).toBe("system");
    expect(parseAppearance(null)).toBe("system");
    expect(parseAppearance("blue")).toBe("system");
  });

  it("resolves 'system' from the phone's preference and the others as themselves", () => {
    expect(resolveAppearance("system", true)).toBe("light");
    expect(resolveAppearance("system", false)).toBe("dark");
    expect(resolveAppearance("light", false)).toBe("light");
    expect(resolveAppearance("dark", true)).toBe("dark");
  });
});
