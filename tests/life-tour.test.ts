import { describe, expect, it } from "vitest";
import { frameHoles } from "../src/lib/tour-frame";

const view = { w: 412, h: 915 };
const r = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe("the tour's highlights", () => {
  it("joins side-by-side controls into one box", () => {
    // Chooser and Dice: two 55x48 buttons next to each other.
    const holes = frameHoles([r(16, 455, 55, 48), r(71, 455, 55, 48)], view);
    expect(holes).toEqual([{ x: 11, y: 450, w: 120, h: 58 }]);
  });

  it("keeps controls that are apart as separate boxes", () => {
    const holes = frameHoles([r(16, 860, 70, 40), r(330, 860, 60, 40)], view);
    expect(holes).toHaveLength(2);
  });

  it("keeps every box inside the screen", () => {
    // The Dungeons button in the bottom-left corner.
    const [hole] = frameHoles([r(0, 880, 80, 35)], view);
    expect(hole.x).toBe(3);
    expect(hole.y + hole.h).toBe(912);
  });

  it("ignores controls that aren't laid out", () => {
    expect(frameHoles([r(10, 10, 0, 0)], view)).toEqual([]);
  });
});
