import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useBackToClose } from "../lib/use-back-to-close";

/**
 * "Show me around" (LifeTutor, roadmap F, Ari 2026-11-16): a short walk over the real table,
 * one control at a time. The table is dimmed with a hole cut around the thing being explained,
 * and a card says what it does, with Next / Skip. It only looks: the overlay takes every tap,
 * so nothing on the table changes. The steps are Ari's list (ROADMAP.md, item F).
 *
 * Controls are found by the labels they already carry for screen readers (the seat nearest the
 * holder, the tray's tools), so the tour needs no hooks in the table's own code beyond opening
 * and closing the tray. A control that isn't there (a tracker switched off in Settings) is just
 * left out of its step.
 */

/** What a step points at, found on the table at the time. */
type Find = (table: HTMLElement) => Element[];

interface Step {
  title: string;
  body: string;
  /** The tools tray is open for this step. */
  tray: boolean;
  find: Find;
}

const LOSE = ": lose 1 life (hold for 10)";

/** The seat nearest the person holding the phone (the lowest one on screen), by its name. */
function holderName(table: HTMLElement): string | null {
  const seats = [...table.querySelectorAll<HTMLElement>("button[aria-label]")].filter((b) => b.getAttribute("aria-label")!.endsWith(LOSE));
  if (!seats.length) return null;
  const lowest = seats.reduce((a, b) => (b.getBoundingClientRect().top > a.getBoundingClientRect().top ? b : a));
  return lowest.getAttribute("aria-label")!.slice(0, -LOSE.length);
}

/** Buttons whose label is exactly one of these (or starts with one, for `prefix`). */
function byLabel(table: HTMLElement, labels: string[], prefix = false): Element[] {
  return [...table.querySelectorAll("button[aria-label]")].filter((b) => {
    const l = b.getAttribute("aria-label")!;
    return labels.some((x) => (prefix ? l.startsWith(x) : l === x));
  });
}

/** The whole seat (its grid cell on the table) of the person holding the phone. */
const holderSeat: Find = (table) => {
  const name = holderName(table);
  const lose = name ? byLabel(table, [`${name}${LOSE}`])[0] : undefined;
  const cell = lose?.closest("[data-life-seat]");
  return cell ? [cell] : [];
};

const seat = (suffixes: string[]): Find => (table) => {
  const name = holderName(table);
  return name ? byLabel(table, suffixes.map((s) => `${name}: ${s}`)) : [];
};

function steps(canJudge: boolean): Step[] {
  return [
    {
      title: "Life",
      body: "Tap the left half of your card to lose 1 life, the right half to gain 1. Hold to change it by 10. The small number beside the total (like −3) shows the change so far.",
      tray: false,
      find: holderSeat,
    },
    {
      title: "Your card's ⋯",
      body: "Counters (poison, energy, commander tax and more), commander damage, partners included, and your card's colour.",
      tray: false,
      find: seat(["counters, commander damage and color"]),
    },
    {
      title: "The round button",
      body: "The button in the middle of the table opens the tools. Tap the X to put them away again.",
      tray: false,
      find: (t) => byLabel(t, ["Open the tools"]),
    },
    {
      title: "History",
      body: "Every change in this game, newest first, so you can check what happened or undo a mistake.",
      tray: true,
      find: (t) => byLabel(t, ["History"]),
    },
    {
      title: "Dice and Chooser",
      body: "Roll any die or flip a coin. Chooser picks who goes first.",
      tray: true,
      find: (t) => byLabel(t, ["Dice", "Choose who goes first"]),
    },
    {
      title: "Cards",
      body: "Look up any card by name or rules text. It's free, and with the card database downloaded (in Settings) it works with no signal.",
      tray: true,
      find: (t) => byLabel(t, ["Cards"]),
    },
    {
      title: "Judge",
      body: canJudge
        ? "Ask a rules question about the cards on the table and get a ruling, with the rules it rests on, without leaving the game."
        : "Ask a rules question about the cards on the table and get a ruling, without leaving the game. It needs an invite from Ari: you sign in with it under Settings.",
      tray: true,
      find: (t) => byLabel(t, ["Judge"], true),
    },
    {
      title: "Where the extras are",
      body: "The monarch, day and night and the round timer are in the tray. Dungeons and the initiative are on each card. The Ring, emblems, the city's blessing and the Enduring Story are in your card's ⋯. Settings > On the table switches off any you don't play with.",
      tray: true,
      find: (t) => [
        ...byLabel(t, ["Day and night", "Monarch", "Round timer"]),
        ...seat(["dungeons and the initiative", "counters, commander damage and color"])(t),
      ],
    },
    {
      title: "Home and Settings",
      body: "Home goes back to the start: resume this game or begin a new one. The gear there opens Settings: light or dark, which trackers to show, the card database, and this tour again.",
      tray: true,
      find: (t) => byLabel(t, ["Home: resume, new game, settings"]),
    },
  ];
}

interface Hole {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 6;

/** The table's tour. `onTray` opens or closes the tools tray for the step; `onDone` ends it (finished or skipped). */
export function LifeTour({ canJudge, onTray, onDone }: { canJudge: boolean; onTray: (open: boolean) => void; onDone: () => void }) {
  // Built once: the measuring effect below re-runs when the step changes, so it must be the same object.
  const all = useMemo(() => steps(canJudge), [canJudge]);
  const [i, setI] = useState(0);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  const step = all[i];
  useBackToClose(onDone);

  // Open or close the tray for this step.
  useEffect(() => onTray(step.tray), [step.tray, onTray]);

  // Measure what the step points at, again on every frame for a moment (the tray slides open in
  // 250 ms) and whenever the window changes size or turns.
  useLayoutEffect(() => {
    const table = document.querySelector<HTMLElement>("[data-life-table]");
    let frame = 0;
    const until = performance.now() + 600;
    const measure = () => {
      setView({ w: window.innerWidth, h: window.innerHeight });
      const found = table ? step.find(table) : [];
      setHoles(
        found
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => ({ x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 })),
      );
    };
    const tick = () => {
      measure();
      if (performance.now() < until) frame = requestAnimationFrame(tick);
    };
    tick();
    // Animation frames pause in a hidden tab, and the table can lay out a moment after the tour
    // opens: a few timed checks as well.
    const timers = [80, 250, 500, 900].map((ms) => window.setTimeout(measure, ms));
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("resize", measure);
    };
  }, [step]);

  const last = i === all.length - 1;
  const next = () => (last ? onDone() : setI(i + 1));

  // Keyboard (the frame on a computer): Escape skips, the right arrow goes on. Enter already presses
  // the focused Next button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The card sits on the far side of the highlight from its middle: below it when the highlight is
  // in the top half of the screen, above it otherwise; in the middle when there's nothing to point at.
  const top = Math.min(...holes.map((h) => h.y));
  const bottom = Math.max(...holes.map((h) => h.y + h.h));
  const middle = holes.length ? (top + bottom) / 2 : view.h / 2;
  const below = middle < view.h / 2;
  const cardStyle: React.CSSProperties = !holes.length
    ? { top: "50%", transform: "translateY(-50%)" }
    : below
      ? { top: Math.min(bottom + 12, view.h - 220) }
      : { bottom: Math.min(view.h - top + 12, view.h - 220) };

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={`Tour, step ${i + 1} of ${all.length}: ${step.title}`}>
      {/* The dimmed table with a hole around each highlighted control. It takes every tap, so the game can't change. */}
      <svg className="absolute inset-0 h-full w-full" width={view.w} height={view.h} aria-hidden="true">
        <defs>
          <mask id="life-tour-holes">
            <rect width="100%" height="100%" fill="white" />
            {holes.map((h, k) => (
              <rect key={k} x={h.x} y={h.y} width={h.w} height={h.h} rx={14} fill="black" />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.68)" mask="url(#life-tour-holes)" />
        {holes.map((h, k) => (
          <rect key={k} x={h.x} y={h.y} width={h.w} height={h.h} rx={14} fill="none" stroke="var(--color-accent)" strokeWidth={3} />
        ))}
      </svg>

      <div className="absolute inset-x-4 mx-auto max-w-sm" style={cardStyle}>
        <div className="space-y-3 rounded-2xl border border-(--color-border) bg-(--color-bg-elev) p-4 text-left text-(--color-text) shadow-2xl">
          <div className="flex items-baseline gap-2">
            <h2 className="min-w-0 flex-1 text-lg font-semibold">{step.title}</h2>
            <span className="shrink-0 text-xs text-(--color-text-dim) tabular-nums">
              {i + 1} of {all.length}
            </span>
          </div>
          <p className="text-sm text-(--color-text-dim)">{step.body}</p>
          <div className="flex items-center gap-2">
            {!last && (
              <button type="button" onClick={onDone} className="min-h-12 rounded-lg px-3 text-sm text-(--color-text-dim) hover:bg-(--color-text)/10">
                Skip
              </button>
            )}
            <span className="flex-1" />
            {i > 0 && (
              <button
                type="button"
                onClick={() => setI(i - 1)}
                className="min-h-12 rounded-lg border border-(--color-border) px-4 text-sm text-(--color-text) hover:bg-(--color-text)/5"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              autoFocus
              className="min-h-12 rounded-lg bg-(--color-accent) px-5 text-sm font-semibold text-(--color-accent-ink) hover:bg-(--color-accent-bright)"
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
