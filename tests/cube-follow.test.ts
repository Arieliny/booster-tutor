import { describe, expect, it } from "vitest";
import { listChanges } from "../src/lib/cube-follow";

describe("Check Cube Cobra: what changed on a followed cube", () => {
  it("finds adds and cuts", () => {
    const r = listChanges(["Black Lotus", "Mox Pearl", "Karakas"], "Black Lotus\nMox Pearl\nGeist of Saint Thalia\n");
    expect(r).toEqual({ added: ["Geist of Saint Thalia"], removed: ["Karakas"] });
  });

  it("matches double-faced cards on the front face and ignores case and blank lines", () => {
    const r = listChanges(["Delver of Secrets", "Fire // Ice"], "\r\ndelver of secrets // Insectile Aberration\r\nFIRE // ICE\r\n\r\n");
    expect(r).toEqual({ added: [], removed: [] });
  });

  it("treats an empty answer as a failure, not as every card cut", () => {
    expect(() => listChanges(["Black Lotus"], "\n")).toThrow();
  });
});
