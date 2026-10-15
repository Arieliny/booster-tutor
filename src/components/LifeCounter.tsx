import { useEffect, useRef, useState } from "react";
import {
  COUNTERS,
  MARKERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_LIFE,
  addCounter,
  changeCmdr,
  changeCounter,
  changeLife,
  colorHex,
  lifeAfter,
  newGame,
  parseGame,
  removeCounter,
  rollDice,
  setColor,
  setLife,
  toggleMarker,
  undo,
  untouched,
  type Entry,
  type Game,
} from "../lib/life";
import { Icon } from "./Icon";
import { LifePanel, type Turn } from "./LifePanel";
import { Sheet } from "./Sheet";

/**
 * Life counter for 2-6 players around one phone. Tap the top half of a seat to
 * gain life, the bottom half to lose it, hold for 5 at a time, tap the total to
 * type one. Each seat's ⋯ has counters, commander damage and its color. On a
 * phone every seat faces its player; on a laptop they all sit upright.
 * The game is kept on this device, and the screen stays awake while it's open.
 */

const KEY = "booster-tutor-life-v2";
const OLD_KEY = "booster-tutor-life-v1";

function load(): Game {
  try {
    const g = parseGame(JSON.parse(localStorage.getItem(KEY) ?? "null")) ?? parseGame(JSON.parse(localStorage.getItem(OLD_KEY) ?? "null"));
    if (g) return g;
  } catch {
    // Fall through to a fresh game.
  }
  return newGame(2, 20);
}

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

function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

const seatName = (count: number, i: number) => (count === 2 ? (i === 0 ? "You" : "Opponent") : `P${i + 1}`);

/**
 * Where each seat goes. On a phone: with 2 players, the opponent faces you
 * from the far end; with more, players sit along both long sides (an odd one
 * out takes the far end).
 */
function seating(count: number, wide: boolean): { i: number; turn: Turn; span: boolean }[] {
  const all = Array.from({ length: count }, (_, i) => i);
  if (wide) return all.map((i) => ({ i, turn: 0, span: false }));
  if (count === 2) return [{ i: 1, turn: 180, span: false }, { i: 0, turn: 0, span: false }];
  const out: { i: number; turn: Turn; span: boolean }[] = [];
  let rest = all;
  if (count % 2 === 1) {
    out.push({ i: 0, turn: 180, span: true });
    rest = all.slice(1);
  }
  rest.forEach((i, k) => out.push({ i, turn: k % 2 === 0 ? 90 : 270, span: false }));
  return out;
}

export function LifeCounter() {
  const [game, setGame] = useState<Game>(load);
  const [sheet, setSheet] = useState<"history" | "dice" | "new" | null>(null);
  const [spin, setSpin] = useState<number | null>(null);
  const [first, setFirst] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const wide = useWide();
  useWakeLock();

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(game));
      localStorage.removeItem(OLD_KEY);
    } catch {
      // Blocked storage: the game still works until the page closes.
    }
  }, [game]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const n = game.players.length;
  const seats = seating(n, wide);
  const cols = wide ? (n === 2 || n === 4 ? 2 : 3) : n === 2 ? 1 : 2;
  const rows = wide ? Math.ceil(n / cols) : n === 2 ? 2 : Math.ceil(n / 2);

  /** Flicker around the table, then land on someone. */
  const whoGoesFirst = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    setFirst(null);
    let at = Math.floor(Math.random() * n);
    const ticks = 12 + Math.floor(Math.random() * n);
    timers.current = Array.from({ length: ticks }, (_, k) =>
      window.setTimeout(() => {
        at = (at + 1) % n;
        if (k < ticks - 1) setSpin(at);
        else {
          setSpin(null);
          setFirst(Math.floor(Math.random() * n));
        }
      }, 70 + k * k * 4),
    );
    timers.current.push(window.setTimeout(() => setFirst(null), 70 + ticks * ticks * 4 + 5000));
  };

  const tool = "flex items-center justify-center gap-1.5 rounded-lg border border-(--color-border) px-2.5 py-2 text-sm text-(--color-text) hover:bg-white/5 disabled:opacity-35";

  return (
    <div className="space-y-3">
      <div
        className="grid h-[calc(100dvh-17rem)] min-h-[22rem] gap-2 md:h-auto"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          ...(wide && { height: `${Math.min(rows * 14, 30)}rem` }),
        }}
      >
        {seats.map(({ i, turn, span }) => {
          const p = game.players[i];
          return (
            <div key={i} className="min-h-0" style={span ? { gridColumn: "1 / -1" } : undefined}>
              <LifePanel
                index={i}
                name={seatName(n, i)}
                player={p}
                turn={turn}
                markers={game.markers}
                others={game.players.flatMap((o, j) => (j === i ? [] : [{ index: j, name: seatName(n, j), color: o.color }]))}
                highlight={first === i ? "first" : spin === i ? "spin" : null}
                onLife={(by) => setGame((g) => changeLife(g, i, by))}
                onSet={(life) => setGame((g) => setLife(g, i, life))}
                onCounter={(key, by) => setGame((g) => changeCounter(g, i, key, by))}
                onAddCounter={(key) => setGame((g) => addCounter(g, i, key))}
                onRemoveCounter={(key) => setGame((g) => removeCounter(g, i, key))}
                onCmdr={(from, by) => setGame((g) => changeCmdr(g, i, from, by))}
                onMarker={(key) => setGame((g) => toggleMarker(g, i, key))}
                onColor={(c) => setGame((g) => setColor(g, i, c))}
              />
            </div>
          );
        })}
      </div>

      <div className="flex gap-1.5">
        <button type="button" onClick={() => setGame(undo)} disabled={!game.history.length} aria-label="Undo the last change" className={tool}>
          <Icon name="undo" className="h-4.5 w-4.5" />
        </button>
        <button type="button" onClick={() => setSheet("history")} aria-label="History" className={tool}>
          <Icon name="history" className="h-4.5 w-4.5" />
        </button>
        <button type="button" onClick={whoGoesFirst} className={tool + " flex-1"}>
          Who's first?
        </button>
        <button type="button" onClick={() => setSheet("dice")} className={tool}>
          <Icon name="dice" className="h-4.5 w-4.5" />
          <span className="hidden min-[400px]:inline">Dice</span>
        </button>
        <button type="button" onClick={() => setSheet("new")} className={tool}>
          New game
        </button>
      </div>

      {sheet === "history" && <HistorySheet game={game} onUndo={() => setGame(undo)} onClose={() => setSheet(null)} />}
      {sheet === "dice" && <DiceSheet onClose={() => setSheet(null)} />}
      {sheet === "new" && (
        <NewGameSheet
          game={game}
          onStart={(count, start) => {
            setGame((g) => newGame(count, start, g));
            setFirst(null);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- sheets

function describe(g: Game, e: Entry, index: number): string {
  const n = g.players.length;
  const who = seatName(n, e.p);
  const sign = (d: number) => (d > 0 ? `+${d}` : `−${-d}`);
  switch (e.kind) {
    case "life":
      return `${who} ${sign(e.d)} → ${lifeAfter(g, index)}`;
    case "set":
      return `${who} set to ${e.d}`;
    case "counter":
      return `${who} ${COUNTERS.find((c) => c.key === e.key)?.label ?? e.key} ${sign(e.d)}`;
    case "cmdr":
      return e.d > 0
        ? `${who} took ${e.d} commander damage from ${seatName(n, e.from ?? 0)} → ${lifeAfter(g, index)}`
        : `${who}: ${-e.d} commander damage from ${seatName(n, e.from ?? 0)} taken back → ${lifeAfter(g, index)}`;
    case "marker": {
      const label = MARKERS.find((m) => m.key === e.key)?.label ?? e.key;
      return e.d > 0 ? `${who} took ${label}` : `${who} lost ${label}`;
    }
    default:
      return who;
  }
}

function HistorySheet({ game, onUndo, onClose }: { game: Game; onUndo: () => void; onClose: () => void }) {
  const entries = game.history.map((e, i) => ({ e, i })).reverse();
  return (
    <Sheet
      title="This game"
      onClose={onClose}
      action={
        <button
          type="button"
          onClick={onUndo}
          disabled={!entries.length}
          className="flex items-center gap-1 rounded border border-(--color-border) px-2.5 py-1 text-sm text-(--color-text) hover:bg-white/5 disabled:opacity-35"
        >
          <Icon name="undo" className="h-4 w-4" /> Undo last
        </button>
      }
    >
      {entries.length === 0 ? (
        <p className="text-sm text-(--color-text-dim)">Nothing yet. Life changes, counters and commander damage show up here.</p>
      ) : (
        <ul className="divide-y divide-(--color-border) text-sm">
          {entries.map(({ e, i }) => (
            <li key={i} className="flex items-center gap-2 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorHex(game.players[e.p].color) }} />
              <span className="flex-1 text-(--color-text)">{describe(game, e, i)}</span>
              <span className="text-xs text-(--color-text-dim) tabular-nums">
                {new Date(e.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

const SIDES = [4, 6, 8, 10, 12, 20];

function DiceSheet({ onClose }: { onClose: () => void }) {
  const [sides, setSides] = useState(20);
  const [count, setCount] = useState(1);
  const [result, setResult] = useState<{ what: string; values: (number | string)[] } | null>(null);
  const chip = (on: boolean) =>
    "rounded-full border px-3 py-1.5 text-sm " +
    (on ? "border-(--color-accent) bg-(--color-accent)/15 text-(--color-text)" : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5");
  const total = result && typeof result.values[0] === "number" && result.values.length > 1 ? (result.values as number[]).reduce((a, b) => a + b, 0) : null;
  return (
    <Sheet title="Dice" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {SIDES.map((s) => (
            <button key={s} type="button" onClick={() => setSides(s)} aria-pressed={sides === s} className={chip(sides === s)}>
              d{s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-(--color-text-dim)">How many</span>
          {[1, 2, 3, 4, 5, 6].map((c) => (
            <button key={c} type="button" onClick={() => setCount(c)} aria-pressed={count === c} className={chip(count === c) + " w-9 px-0"}>
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setResult({ what: `${count}d${sides}`, values: rollDice(count, sides) })}
            className="flex-1 rounded-lg bg-(--color-accent) py-3 text-base font-semibold text-black hover:bg-(--color-accent-bright)"
          >
            Roll {count}d{sides}
          </button>
          <button
            type="button"
            onClick={() => setResult({ what: "Coin", values: [Math.random() < 0.5 ? "Heads" : "Tails"] })}
            className="rounded-lg border border-(--color-border) px-4 py-3 text-base text-(--color-text) hover:bg-white/5"
          >
            Flip a coin
          </button>
        </div>
        {result && (
          <div className="rounded-xl border border-(--color-border) bg-(--color-bg) p-4 text-center" aria-live="polite">
            <div className="text-xs text-(--color-text-dim)">{result.what}</div>
            <div className="mt-1 flex flex-wrap justify-center gap-3 text-4xl font-semibold text-(--color-text) tabular-nums">
              {result.values.map((v, i) => (
                <span key={i}>{v}</span>
              ))}
            </div>
            {total !== null && <div className="mt-1 text-sm text-(--color-text-dim)">Total {total}</div>}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function NewGameSheet({ game, onStart, onClose }: { game: Game; onStart: (count: number, start: number) => void; onClose: () => void }) {
  const [count, setCount] = useState(game.players.length);
  const [start, setStart] = useState(game.start);
  const chip = (on: boolean) =>
    "rounded-full border px-3.5 py-1.5 text-sm " +
    (on ? "border-(--color-accent) bg-(--color-accent)/15 text-(--color-text)" : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5");
  return (
    <Sheet title="New game" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="text-sm text-(--color-text-dim)">Players</div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, k) => k + MIN_PLAYERS).map((c) => (
              <button key={c} type="button" onClick={() => setCount(c)} aria-pressed={count === c} className={chip(count === c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-sm text-(--color-text-dim)">Starting life</div>
          <div className="flex flex-wrap gap-1.5">
            {STARTING_LIFE.map((s) => (
              <button key={s} type="button" onClick={() => setStart(s)} aria-pressed={start === s} className={chip(start === s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onStart(count, start)}
          className="w-full rounded-lg bg-(--color-accent) py-3 text-base font-semibold text-black hover:bg-(--color-accent-bright)"
        >
          {untouched(game) ? "Start" : "End this game and start"}
        </button>
        <p className="text-xs text-(--color-text-dim)">Seats keep their colors. The current game's history is cleared.</p>
      </div>
    </Sheet>
  );
}
