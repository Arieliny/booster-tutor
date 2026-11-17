/** The tour's highlights (components/LifeTour.tsx): where the holes in the dimmed table go. */

export interface Hole {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 5;
/** How far a ring stays inside the screen, so its whole outline shows. */
const EDGE = 3;

/**
 * The highlights for what a step found: each control padded a little, side-by-side controls joined
 * into one box (separate rings overlapped and cut through the labels; Ari, 2026-11-16), and every box
 * kept inside the screen (a ring round a corner control was cut off by the edge).
 */
export function frameHoles(rects: { left: number; top: number; width: number; height: number }[], view: { w: number; h: number }): Hole[] {
  let boxes = rects
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ l: r.left - PAD, t: r.top - PAD, r: r.left + r.width + PAD, b: r.top + r.height + PAD }));
  // Join boxes that overlap or nearly touch, until none do.
  for (let joined = true; joined; ) {
    joined = false;
    outer: for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a];
        const B = boxes[b];
        if (A.l <= B.r + 2 && B.l <= A.r + 2 && A.t <= B.b + 2 && B.t <= A.b + 2) {
          boxes[a] = { l: Math.min(A.l, B.l), t: Math.min(A.t, B.t), r: Math.max(A.r, B.r), b: Math.max(A.b, B.b) };
          boxes = boxes.filter((_, k) => k !== b);
          joined = true;
          break outer;
        }
      }
    }
  }
  return boxes.map((x) => {
    const l = Math.max(x.l, EDGE);
    const t = Math.max(x.t, EDGE);
    const r = Math.min(x.r, view.w - EDGE);
    const b = Math.min(x.b, view.h - EDGE);
    return { x: l, y: t, w: Math.max(r - l, 0), h: Math.max(b - t, 0) };
  });
}
