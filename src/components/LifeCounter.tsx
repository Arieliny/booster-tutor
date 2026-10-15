import { useEffect, useRef, useState } from "react";

/**
 * Two-player life counter. Tap the top half of a player's side to gain life,
 * the bottom half to lose it; a running "+3" shows while you tap. On a phone
 * the opponent's side is upside down, so one phone lies between the players.
 * Totals are kept on this device, and the screen stays awake while it's open.
 */

const KEY = "booster-tutor-life-v1";
const STARTS = [20, 25, 30, 40];

interface Game {
  start: number;
  life: [number, number];
}

function load(): Game {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? "null") as Game | null;
    if (g && STARTS.includes(g.start) && Array.isArray(g.life) && g.life.length === 2) return g;
  } catch {
    // Fall through to a fresh game.
  }
  return { start: 20, life: [20, 20] };
}

/** Keep the screen on while the counter is showing (where the browser allows it). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const grab = async () => {
      if (document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      try {
        lock = await navigator.wakeLock.request("screen");
        if (!live) void lock.release();
      } catch {
        // Battery saver or no permission: the counter still works.
      }
    };
    void grab();
    // The browser drops the lock when the tab is hidden; take it back on return.
    document.addEventListener("visibilitychange", grab);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", grab);
      void lock?.release();
    };
  }, []);
}

export function LifeCounter() {
  const [game, setGame] = useState<Game>(load);
  const [confirmReset, setConfirmReset] = useState(false);
  useWakeLock();

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(game));
    } catch {
      // Blocked storage: the game still works until the page closes.
    }
  }, [game]);

  const change = (p: 0 | 1, by: number) =>
    setGame((g) => {
      const life: [number, number] = [...g.life];
      life[p] += by;
      return { ...g, life };
    });

  const newGame = (start = game.start) => {
    setGame({ start, life: [start, start] });
    setConfirmReset(false);
  };

  const untouched = game.life[0] === game.start && game.life[1] === game.start;

  return (
    <div className="space-y-3">
      <div className="grid h-[calc(100dvh-17rem)] min-h-[22rem] grid-rows-2 gap-2 md:h-[26rem] md:grid-cols-2 md:grid-rows-1">
        <Player name="Opponent" life={game.life[1]} onChange={(by) => change(1, by)} flipped />
        <Player name="You" life={game.life[0]} onChange={(by) => change(0, by)} />
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-(--color-text-dim)">
          Start at
          <select
            value={game.start}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (untouched) newGame(n);
              else setGame((g) => ({ ...g, start: n }));
            }}
            className="rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-2 py-1.5 text-sm text-(--color-text)"
          >
            {STARTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => (untouched || confirmReset ? newGame() : setConfirmReset(true))}
          onBlur={() => setConfirmReset(false)}
          className={
            "ml-auto rounded-lg border px-3 py-1.5 text-sm " +
            (confirmReset
              ? "border-red-400/60 bg-red-500/10 text-red-200"
              : "border-(--color-border) text-(--color-text) hover:bg-white/5")
          }
        >
          {confirmReset ? `Tap again: both to ${game.start}` : "New game"}
        </button>
      </div>
    </div>
  );
}

function Player({ name, life, onChange, flipped }: { name: string; life: number; onChange: (by: number) => void; flipped?: boolean }) {
  // The running change while you tap, cleared after a pause.
  const [delta, setDelta] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const tap = (by: number) => {
    onChange(by);
    setDelta((d) => d + by);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDelta(0), 1500);
  };

  const half = "flex flex-1 justify-center text-2xl text-(--color-text-dim)/60 select-none active:bg-white/5";

  return (
    <div
      className={
        "relative flex flex-col overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-bg-elev) " +
        (flipped ? "rotate-180 md:rotate-0" : "")
      }
    >
      <button type="button" onClick={() => tap(1)} aria-label={`${name}: gain 1 life`} className={`${half} items-start pt-3`}>
        +
      </button>
      <button
        type="button"
        onClick={() => tap(-1)}
        aria-label={`${name}: lose 1 life`}
        className={`${half} items-end pb-3`}
      >
        −
      </button>

      {/* The total sits over both halves; taps go through it to the half underneath. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xs font-medium tracking-wide text-(--color-text-dim) uppercase">{name}</div>
        <div
          className={
            "text-7xl leading-none font-semibold tabular-nums sm:text-8xl " + (life <= 0 ? "text-red-400" : "text-(--color-text)")
          }
          aria-live="polite"
        >
          {life}
        </div>
        <div className={"h-6 text-lg font-medium tabular-nums " + (delta > 0 ? "text-emerald-300" : "text-red-300")}>
          {delta !== 0 && (delta > 0 ? `+${delta}` : `−${-delta}`)}
        </div>
      </div>
    </div>
  );
}
