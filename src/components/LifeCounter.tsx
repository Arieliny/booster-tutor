import { Fragment, Suspense, lazy, useEffect, useRef, useState } from "react";
// Latin digits only: Nunito Black for the big numbers.
import "@fontsource/nunito/latin-900.css";
import { DUNGEONS, INITIATIVE_TEXT, dungeonOf, isLastRoom, mapLinks, roomsAhead, type DungeonKey, type MapLink } from "../lib/dungeons";
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
  completeDungeon,
  enterRoom,
  giveMarker,
  lifeAfter,
  newGame,
  parseGame,
  removeCounter,
  rollDice,
  setCmdrTracking,
  setColor,
  setCounterIcon,
  undo,
  untouched,
  type Entry,
  type Game,
} from "../lib/life";
import { Icon, type IconName } from "./Icon";
import { LifePanel, Turned, type Corner, type Turn } from "./LifePanel";
import { Sheet } from "./Sheet";
import { useBackToClose } from "../lib/use-back-to-close";
import { startQuestionAbout } from "../lib/judge";
import { COIN_HEAD, COIN_TAIL } from "../lib/coin-art";

// The rules judge, opened over the counter from the tray (loaded only when first opened).
const Judge = lazy(() => import("./Judge").then((m) => ({ default: m.Judge })));
// Card search by name, for everyone, opened the same way.
const CardSearch = lazy(() => import("./CardSearch").then((m) => ({ default: m.CardSearch })));

/**
 * Full-screen life counter for 2-6 players around one phone. Left half of a
 * seat loses life, right half gains it, holding steps by 10, tapping the total
 * types one. The round button in the middle slides open the table tools: exit,
 * undo, history, new game, the monarch and the initiative (tap, then tap who
 * takes it), who goes first, and a die. Taking the initiative ventures into
 * Undercity on the dungeon map, where each room says what it does.
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

/**
 * In a browser tab: true full screen (hides the phone's status and navigation
 * bars) while the counter is open, locked to portrait so it doesn't flip when
 * the phone lies flat. The installed app is full screen anyway. Browsers only allow it right after a tap: opening Life counts; after a
 * reload, or if someone swiped the bars back, the next tap does it. iPhones
 * don't support it in the browser, so there the counter just fills the page.
 */
function useFullscreen() {
  useEffect(() => {
    const el = document.documentElement;
    // The installed app already runs full screen (manifest display: fullscreen). Asking again
    // would only bring up Chrome's "to exit full screen" banner, so only do it in a browser tab.
    if (!el.requestFullscreen || !window.matchMedia("(display-mode: browser)").matches) return;
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    const enter = () => {
      if (document.fullscreenElement) return;
      el.requestFullscreen({ navigationUI: "hide" })
        .then(() => orientation?.lock?.("portrait").catch(() => {}))
        .catch(() => {
          // Not allowed without a tap yet: the next tap tries again.
        });
    };
    enter();
    document.addEventListener("pointerup", enter);
    return () => {
      document.removeEventListener("pointerup", enter);
      orientation?.unlock?.();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
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

/**
 * Which corner of each seat gets the dungeons door while the tray is open.
 * The tray bar runs across the middle of the screen, so a seat touching it
 * puts the door in a corner on its far side. Which side that is, from the
 * player's view, depends on which way the seat is turned. The bottom right
 * is always the ⋯ menu.
 */
function doorCorners(seats: { i: number; turn: Turn; span: boolean }[], cols: number, rows: number): Record<number, Corner> {
  const out: Record<number, Corner> = {};
  let row = 0;
  let inRow = 0;
  for (const s of seats) {
    // Where the bar is from this seat on screen: below it, above it, or across its middle.
    const bar = (row + 1) / rows <= 0.5 ? "down" : row / rows >= 0.5 ? "up" : null;
    // The same direction from the player's side of the table.
    const side =
      bar === null
        ? null
        : s.turn === 0
          ? bar === "up" ? "top" : "bottom"
          : s.turn === 180
            ? bar === "up" ? "bottom" : "top"
            : s.turn === 90
              ? bar === "up" ? "left" : "right"
              : bar === "up" ? "right" : "left";
    out[s.i] = side === "top" ? "bl" : side === "left" ? "tr" : "tl";
    if (s.span || ++inRow === cols) {
      row++;
      inRow = 0;
    }
  }
  return out;
}

/** Judge or card search: full screen over the counter; closing it (✕ or the phone's Back) comes straight back to the game. */
function ToolScreen({ icon, title, what, onClose, children }: { icon: IconName; title: string; what: string; onClose: () => void; children: React.ReactNode }) {
  useBackToClose(onClose);
  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-(--color-bg) text-(--color-text)" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-(--color-border) px-4">
        <Icon name={icon} className="h-5 w-5 text-(--color-text-dim)" />
        <span className="flex-1 text-lg font-semibold">{title}</span>
        <button type="button" onClick={onClose} aria-label={`Close ${what}`} className="rounded-full p-1.5 text-(--color-text-dim) hover:bg-white/10">
          <Icon name="close" className="h-6 w-6" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4">
        <Suspense fallback={<p className="text-sm text-(--color-text-dim)">Loading {what}…</p>}>{children}</Suspense>
      </div>
    </div>
  );
}

const seatName = (count: number, i: number) => (count === 2 ? (i === 0 ? "You" : "Opponent") : `P${i + 1}`);

/**
 * Where each seat goes. On a phone: with 2 players, the opponent faces you
 * from the far end; with more, players sit along both long sides (an odd one
 * out takes the far end). On a laptop they all sit upright.
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

type SheetKind = { kind: "history" } | { kind: "new" } | { kind: "judge" } | { kind: "cards" } | { kind: "dungeon"; p: number };

const DICE = [4, 6, 8, 10, 12, 20];

/** A roll on the table: what was rolled, what it shows now (it tumbles first), and a key to restart the animation. */
interface Roll {
  what: number | "coin";
  /** Where it landed. */
  final: string;
  /** What it shows right now (other dice flick through faces as they tumble). */
  shown: string;
  rolling: boolean;
  id: number;
  /** Coin: how far it spins (ends on the side it landed on). */
  ry: number;
  /** Dice: seeds the tumble, so the copy facing each side moves the same way. */
  seed: number;
}

export function LifeCounter({ onExit, canJudge = false }: { onExit: () => void; canJudge?: boolean }) {
  const [game, setGame] = useState<Game>(load);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [barOpen, setBarOpen] = useState(false);
  const [giving, setGiving] = useState<"monarch" | null>(null);
  const [spin, setSpin] = useState<number | null>(null);
  const [first, setFirst] = useState<number | null>(null);
  // The tray shows the dice instead of the tools; the latest roll.
  const [diceTray, setDiceTray] = useState(false);
  const [roll, setRoll] = useState<Roll | null>(null);
  const rollTimer = useRef<number | undefined>(undefined);
  const timers = useRef<number[]>([]);
  const wide = useWide();
  useWakeLock();
  useFullscreen();

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(game));
      localStorage.removeItem(OLD_KEY);
    } catch {
      // Blocked storage: the game still works until the page closes.
    }
  }, [game]);
  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      window.clearInterval(rollTimer.current);
    },
    [],
  );
  // The page underneath mustn't scroll while the counter covers it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const n = game.players.length;
  const seats = seating(n, wide);
  const cols = wide ? (n === 2 || n === 4 ? 2 : 3) : n === 2 ? 1 : 2;
  const rows = wide ? Math.ceil(n / cols) : n === 2 ? 2 : Math.ceil(n / 2);
  const doors = doorCorners(seats, cols, rows);

  /** Flicker around the table, then land on someone. */
  const whoGoesFirst = () => {
    setBarOpen(false);
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

  /** Roll a die (or flip the coin): it tumbles through faces for a moment, then lands. */
  const rollIt = (what: number | "coin") => {
    window.clearInterval(rollTimer.current);
    const { final, ry, seed } = decideRoll(what);
    let left = 12; // 1.2 s, then the result label shows
    setRoll((r) => ({ what, final, shown: final, rolling: true, id: (r?.id ?? 0) + 1, ry, seed }));
    rollTimer.current = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        window.clearInterval(rollTimer.current);
        setRoll((r) => r && { ...r, rolling: false });
      }
    }, 100);
  };

  const backToTools = () => {
    setDiceTray(false);
    setRoll(null);
    window.clearInterval(rollTimer.current);
  };

  const closeTray = () => {
    setBarOpen(false);
    setDiceTray(false);
    setRoll(null);
    window.clearInterval(rollTimer.current);
  };

  /** Someone was picked to become the monarch. */
  const pick = (i: number) => {
    setGiving(null);
    setGame((g) => giveMarker(g, i, "monarch"));
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black p-1.5 select-none" style={{ paddingTop: "max(env(safe-area-inset-top), 0.375rem)", paddingBottom: "max(env(safe-area-inset-bottom), 0.375rem)" }}>
      <div className="relative min-h-0 flex-1">
        <div
          className="grid h-full gap-1.5"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
        >
          {seats.map(({ i, turn, span }) => (
            <div key={i} className="min-h-0" style={span ? { gridColumn: "1 / -1" } : undefined}>
              <LifePanel
                index={i}
                name={seatName(n, i)}
                player={game.players[i]}
                turn={turn}
                markers={game.markers}
                icons={game.icons}
                others={game.players.flatMap((o, j) => (j === i ? [] : [{ index: j, name: seatName(n, j), color: o.color }]))}
                highlight={first === i ? "first" : spin === i ? "spin" : null}
                trayOpen={barOpen && !diceTray}
                doorCorner={doors[i]}
                picking={giving ? "Becomes the monarch" : null}
                onPick={() => pick(i)}
                onLife={(by) => setGame((g) => changeLife(g, i, by))}
                onCounter={(key, by) => setGame((g) => changeCounter(g, i, key, by))}
                onAddCounter={(key) => setGame((g) => addCounter(g, i, key))}
                onRemoveCounter={(key) => setGame((g) => removeCounter(g, i, key))}
                onCounterIcon={(key, icon) => setGame((g) => setCounterIcon(g, key, icon))}
                onMenu={closeTray}
                onCmdr={(from, by) => setGame((g) => changeCmdr(g, i, from, by))}
                onCmdrTracking={(on) => setGame((g) => setCmdrTracking(g, i, on))}
                onDungeon={() => {
                  setBarOpen(false);
                  setSheet({ kind: "dungeon", p: i });
                }}
                onColor={(c) => setGame((g) => setColor(g, i, c))}
                // 1v1: the crown just switches sides. More players: pick who gets it.
                onPassMonarch={() => {
                  if (n === 2) setGame((g) => giveMarker(g, i === 0 ? 1 : 0, "monarch"));
                  else {
                    closeTray();
                    setGiving("monarch");
                  }
                }}
              />
            </div>
          ))}
        </div>

        {/* The middle button, which slides open into the tools bar (or the dice). */}
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2">
          {roll && <RollResult roll={roll} flipped onClear={() => setRoll(null)} />}
          {giving ? (
            <button
              type="button"
              onClick={() => setGiving(null)}
              className="pointer-events-auto rounded-full border-4 border-black bg-white px-5 py-3 text-sm font-semibold text-black"
            >
              Cancel
            </button>
          ) : (
            <div
              className="pointer-events-auto flex items-center overflow-hidden border-4 border-black bg-[#14161c] transition-[width,border-radius] duration-[250ms] ease-out"
              // A real radius (half the height) rather than "fully round", so the corners square off
              // in step with the width instead of snapping at the end.
              style={{ width: barOpen ? "100%" : "3.75rem", height: "3.75rem", borderRadius: barOpen ? 0 : 30 }}
            >
              <div className={"flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden transition-opacity duration-150 " + (barOpen ? "opacity-100" : "pointer-events-none opacity-0")}>
                {diceTray ? (
                  <>
                    {/* Back to the tools (the X closes the whole tray). */}
                    <Tool icon="back" label="Back" onClick={backToTools} />
                    {DICE.slice(0, 3).map((d) => (
                      <DieButton key={d} label={`d${d}`} onClick={() => rollIt(d)} />
                    ))}
                  </>
                ) : (
                  <>
                    <Tool icon="exit" label="Exit" onClick={onExit} />
                    <Tool icon="history" label="History" onClick={() => setSheet({ kind: "history" })} />
                    <Tool icon="refresh" label="New" hint="New game" onClick={() => setSheet({ kind: "new" })} />
                    <Tool icon="flag" label="Chooser" hint="Choose who goes first" onClick={whoGoesFirst} />
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => (barOpen ? closeTray() : setBarOpen(true))}
                aria-label={barOpen ? (diceTray ? "Put the dice away" : "Close the tools") : "Open the tools"}
                aria-expanded={barOpen}
                className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-full bg-white text-black"
              >
                <Icon name={barOpen ? "close" : "menu"} className="h-6 w-6" />
              </button>
              <div className={"flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden transition-opacity duration-150 " + (barOpen ? "opacity-100" : "pointer-events-none opacity-0")}>
                {diceTray ? (
                  <>
                    {DICE.slice(3).map((d) => (
                      <DieButton key={d} label={`d${d}`} onClick={() => rollIt(d)} />
                    ))}
                    <DieButton label="Coin" coin onClick={() => rollIt("coin")} />
                  </>
                ) : (
                  <>
                    <Tool icon="crown" label="Monarch" tint="#F5C04A" onClick={() => (setBarOpen(false), setGiving("monarch"))} />
                    <Tool icon="dice" label="Dice" onClick={() => setDiceTray(true)} />
                    {canJudge && <Tool icon="scales" label="Judge" onClick={() => setSheet({ kind: "judge" })} />}
                    <Tool icon="cardBack" label="Cards" onClick={() => setSheet({ kind: "cards" })} />
                  </>
                )}
              </div>
            </div>
          )}
          {roll && <RollResult roll={roll} onClear={() => setRoll(null)} />}
        </div>
      </div>

      {sheet?.kind === "history" && <HistorySheet game={game} onUndo={() => setGame(undo)} onClose={() => setSheet(null)} />}
      {sheet?.kind === "judge" && (
        <ToolScreen icon="scales" title="Judge" what="the judge" onClose={() => setSheet(null)}>
          <Judge embedded />
        </ToolScreen>
      )}
      {sheet?.kind === "cards" && (
        <ToolScreen icon="cardBack" title="Look up a card" what="card search" onClose={() => setSheet(null)}>
          <CardSearch
            // A card's "Ask the judge" opens the judge here, about that card, without leaving the game.
            onAskJudge={
              canJudge
                ? (name) => {
                    startQuestionAbout(name);
                    setSheet({ kind: "judge" });
                  }
                : undefined
            }
          />
        </ToolScreen>
      )}
      {sheet?.kind === "dungeon" && (
        <DungeonTracker
          game={game}
          p={sheet.p}
          turn={seats.find((x) => x.i === sheet.p)?.turn ?? 0}
          name={seatName(n, sheet.p)}
          // Venturing into Undercity is how the initiative works, so it takes the initiative too.
          onEnter={(key, room) => {
            const who = sheet.p;
            setGame((g) => enterRoom(g, who, key, room, Date.now(), key === "undercity"));
            // Picking the room is the whole move: back to the game.
            setSheet(null);
          }}
          onComplete={() => setGame((g) => completeDungeon(g, sheet.p))}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "new" && (
        <NewGameSheet
          game={game}
          onStart={(count, start) => {
            setGame((g) => newGame(count, start, g));
            setFirst(null);
            setSheet(null);
            setBarOpen(false);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

/** A button in the middle bar. */
/** A tray button: icon and short label; `hint` is the fuller name for tooltips and screen readers. */
function Tool({ icon, label, hint, onClick, tint, disabled }: { icon: IconName; label: string; hint?: string; onClick: () => void; tint?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={hint ?? label}
      title={hint ?? label}
      className="flex h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-full text-white hover:bg-white/10 disabled:opacity-30"
      style={tint ? { color: tint } : undefined}
    >
      <Icon name={icon} className="h-5.5 w-5.5" />
      <span className="mt-0.5 hidden text-[10px] leading-none text-white/70 min-[420px]:block">{label}</span>
    </button>
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
    case "cmdr": {
      const life = e.withLife ? ` → ${lifeAfter(g, index)}` : "";
      return e.d > 0
        ? `${who} took ${e.d} commander damage from ${seatName(n, e.from ?? 0)}${life}`
        : `${who}: ${-e.d} commander damage from ${seatName(n, e.from ?? 0)} taken back${life}`;
    }
    case "marker": {
      const label = MARKERS.find((m) => m.key === e.key)?.label ?? e.key;
      return e.d > 0 ? `${who} took ${label === "Monarch" ? "the monarch" : "the initiative"}` : `${who} lost ${label}`;
    }
    case "dungeon":
      return e.room ? `${who} ventured into ${e.room}` : `${who} completed a dungeon`;
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
        <p className="text-sm text-(--color-text-dim)">Nothing yet. Life changes, counters, commander damage and dungeon moves show up here.</p>
      ) : (
        <ul className="divide-y divide-(--color-border) text-sm">
          {entries.map(({ e, i }) => (
            <li key={i} className="flex items-center gap-2 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorHex(game.players[e.p].color) }} />
              <span className="flex-1 text-(--color-text)">{describe(game, e, i)}</span>
              <span className="text-xs text-(--color-text-dim) tabular-nums">{new Date(e.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/**
 * Where a roll lands, decided before any animation: the coin then spins to
 * that side, and the die (seeded, so both copies match) tumbles onto it.
 */
function decideRoll(what: number | "coin"): { final: string; ry: number; seed: number } {
  const final = what === "coin" ? (Math.random() < 0.5 ? "Heads" : "Tails") : String(rollDice(1, what)[0]);
  const ry = 360 * (4 + Math.floor(Math.random() * 2)) + (final === "Tails" ? 180 : 0);
  return { final, ry, seed: Math.floor(Math.random() * 2 ** 31) };
}

/** A die (or the coin) in the dice tray: tap to roll it straight away. */
function DieButton({ label, coin, onClick }: { label: string; coin?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={coin ? "Flip a coin" : `Roll a ${label}`}
      className="flex h-11 min-w-0 flex-1 items-center justify-center text-white"
    >
      <span
        className={
          "flex h-9 min-w-9 items-center justify-center border-2 px-1 font-life text-sm font-black " +
          (coin ? "rounded-full border-[#F5C04A] text-[#F5C04A]" : "rounded-lg border-white/70")
        }
      >
        {coin ? "Coin" : label}
      </span>
    </button>
  );
}

/** The roll, shown at the middle of the table; `flipped` faces the far side. Tap to clear. */
function RollResult({ roll, flipped, onClear }: { roll: Roll; flipped?: boolean; onClear: () => void }) {
  const label = roll.what === "coin" ? "Coin" : `d${roll.what}`;
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={`${label}: ${roll.rolling ? "rolling" : roll.final}. Tap to clear.`}
      className={"pointer-events-auto flex flex-col items-center " + (flipped ? "rotate-180" : "")}
    >
      {/* Drops in and bounces; the die itself turns inside. */}
      <span key={roll.id} className="block" style={{ animation: "bt-drop 0.95s ease-out" }}>
        {roll.what === "coin" ? <Coin roll={roll} /> : <Die3D roll={roll} sides={roll.what} />}
      </span>
      <span className={"mt-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white " + (roll.rolling ? "opacity-0" : "")}>
        {label} · {roll.final}
      </span>
    </button>
  );
}

/** A coin that spins to the side it landed on: a dragon's head for heads, a dragon's tail for tails (art: lib/coin-art.ts). */
function Coin({ roll }: { roll: Roll }) {
  const face = "absolute inset-0 flex items-center justify-center rounded-full border-4 border-[#b8860b] bg-[#F5C04A] text-[#5a3d00]";
  return (
    <span className="block h-20 w-20" style={{ perspective: 400 }}>
      <span
        className="relative block h-full w-full"
        style={
          {
            transformStyle: "preserve-3d",
            "--end": `${roll.ry}deg`,
            animation: "bt-coin 1s cubic-bezier(.2,.7,.3,1) forwards",
          } as React.CSSProperties
        }
      >
        <span className={face} style={{ backfaceVisibility: "hidden" }}>
          {/* Heads: a spiked dragon head. */}
          <svg viewBox="0 0 512 512" className="h-14 w-14" fill="currentColor" aria-hidden="true">
            <path d={COIN_HEAD} />
          </svg>
        </span>
        <span className={face} style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
          {/* Tails: a reptile tail. */}
          <svg viewBox="0 0 512 512" className="h-14 w-14" fill="currentColor" aria-hidden="true">
            <path d={COIN_TAIL} />
          </svg>
        </span>
      </span>
    </span>
  );
}

/**
 * A real 3D die (three.js, loaded the first time anyone rolls). If 3D can't
 * run on this device, the result shows as a plain number instead.
 */
function Die3D({ roll, sides }: { roll: Roll; sides: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const { id, seed, final } = roll;
  useEffect(() => {
    let live = true;
    let stop: (() => void) | undefined;
    import("../lib/dice3d")
      .then((m) => (live && ref.current ? m.rollDie(ref.current, { sides, result: Number(final), seed }) : undefined))
      .then((cleanup) => {
        if (live) stop = cleanup;
        else cleanup?.();
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
      stop?.();
    };
  }, [id, sides, seed, final]);
  if (failed) {
    return <span className="flex h-28 w-28 items-center justify-center rounded-2xl bg-white font-life text-5xl font-black text-black">{final}</span>;
  }
  return <canvas ref={ref} className="block h-28 w-28" />;
}

/**
 * The dungeons and the initiative, full screen and turned to face the player
 * who opened it. Every player's marker shows in the room they're in; the
 * rooms this player can venture into next are marked.
 */
function DungeonTracker({
  game,
  p,
  turn,
  name,
  onEnter,
  onComplete,
  onClose,
}: {
  game: Game;
  p: number;
  turn: Turn;
  name: string;
  onEnter: (key: DungeonKey, room: string) => void;
  onComplete: () => void;
  onClose: () => void;
}) {
  const player = game.players[p];
  const cur = player.dungeon;
  const [tab, setTab] = useState<DungeonKey>(cur?.key ?? "undercity");
  const d = dungeonOf(tab);
  const holds = game.markers.initiative === p;
  const hex = colorHex(player.color);

  // Out of a dungeon: any dungeon's first room (Undercity's means taking the initiative).
  const canGo = (room: string) => (cur ? cur.key === tab && (d.rooms[cur.room]?.next ?? []).includes(room) : room === d.rows[0][0]);
  // In this dungeon, the paths still open are lit and the rooms left behind fade.
  const inside = cur?.key === tab;
  const ahead = inside ? roomsAhead(d, cur.room) : new Set<string>();
  const links = mapLinks(d);
  const lineState = (l: MapLink): LineState =>
    !inside ? "plain" : (l.a === cur.room || ahead.has(l.a)) && ahead.has(l.b) ? "open" : "closed";
  const markersIn = (key: DungeonKey, room?: string) =>
    game.players.flatMap((pl, i) => (pl.dungeon?.key === key && (!room || pl.dungeon.room === room) ? [{ i, color: pl.color }] : []));
  const dot = (color: string, mine: boolean) => (
    <span
      className={"inline-block shrink-0 rounded-full " + (mine ? "h-3.5 w-3.5 ring-2 ring-white" : "h-3 w-3 ring-1 ring-white/60")}
      style={{ background: color }}
    />
  );

  return (
    <div className="absolute inset-0 z-40 bg-[#0f1115] text-white">
      <Turned turn={turn}>
        {() => (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              {dot(hex, true)}
              <span className="flex-1 text-base font-semibold">Dungeons</span>
              <span className="sr-only">for {name}</span>
              <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-white/70 hover:bg-white/10">
                <Icon name="close" className="h-6 w-6" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
              <div className="rounded-xl bg-white/5 p-3 text-sm">
                <p className="flex items-start gap-2">
                  <Icon name="door" className="mt-0.5 h-5 w-5 shrink-0 text-[#C9B8FF]" />
                  <span>
                    {holds ? (
                      <>
                        <b className="font-semibold">You have the initiative.</b> At your upkeep, venture into Undercity: tap the room you move to.
                      </>
                    ) : (
                      <>
                        Venturing into Undercity <b className="font-semibold">takes the initiative</b>. Just looking? Close without tapping a room.
                      </>
                    )}
                  </span>
                </p>
                <p className="mt-2 text-xs text-white/60">{INITIATIVE_TEXT}</p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {DUNGEONS.map((x) => {
                  const inside = markersIn(x.key);
                  return (
                    <button
                      key={x.key}
                      type="button"
                      onClick={() => setTab(x.key)}
                      aria-pressed={tab === x.key}
                      className={
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs " +
                        (tab === x.key ? "border-white bg-white text-black" : "border-white/25 text-white/80 hover:bg-white/10")
                      }
                    >
                      {x.name}
                      {inside.map((m) => (
                        <span key={m.i} className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorHex(m.color) }} />
                      ))}
                    </button>
                  );
                })}
              </div>

              <div>
                {d.rows.map((row, r) => (
                  <Fragment key={r}>
                    {r > 0 && <MapLines links={links.filter((l) => l.row === r - 1)} state={lineState} />}
                    <div className="flex gap-2">
                      {row.map((roomName, slot) => {
                        if (!roomName) {
                          // The empty slot a longer path runs through.
                          const through = links.find((l) => l.row === r && l.from === slot);
                          return (
                            <div key={slot} className="flex min-w-0 flex-1 justify-center">
                              <div className={"w-0.5 " + LINE_CLASS[through ? lineState(through) : "plain"]} />
                            </div>
                          );
                        }
                        const here = markersIn(tab, roomName);
                        const go = canGo(roomName);
                        const mineHere = inside && cur.room === roomName;
                        const next = d.rooms[roomName].next;
                        return (
                          <button
                            key={roomName}
                            type="button"
                            disabled={!go}
                            onClick={() => onEnter(tab, roomName)}
                            className={
                              "min-w-0 flex-1 rounded-xl border p-2.5 text-left " +
                              (go ? "border-2 border-dashed border-[#B9A4FF] bg-[#B9A4FF]/10" : mineHere ? "border-2" : "border-white/15") +
                              (inside && !mineHere && !ahead.has(roomName) ? " opacity-35" : "")
                            }
                            style={mineHere ? { borderColor: hex, background: `color-mix(in srgb, ${hex} 22%, transparent)` } : undefined}
                          >
                            <span className="flex items-center gap-1.5 text-sm font-semibold">
                              <span className="min-w-0 flex-1">{roomName}</span>
                              {here.map((m) => (
                                <span key={m.i}>{dot(colorHex(m.color), m.i === p)}</span>
                              ))}
                            </span>
                            <span className="mt-1 block text-xs leading-snug text-white/75">{d.rooms[roomName].effect}</span>
                            {go && (
                              <span className="mt-1.5 block text-xs leading-snug text-[#B9A4FF]">
                                <b className="font-semibold">Venture here</b>
                                {next.length ? <> · then {next.join(" or ")}</> : <> · the last room</>}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </Fragment>
                ))}
              </div>

              {cur && cur.key === tab && isLastRoom(cur.key, cur.room) && (
                <button type="button" onClick={onComplete} className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
                  Complete the dungeon
                </button>
              )}
              {player.completed ? <p className="text-xs text-white/60">Dungeons you've completed this game: {player.completed}</p> : null}
            </div>
          </div>
        )}
      </Turned>
    </div>
  );
}

type LineState = "plain" | "open" | "closed";
const LINE_CLASS: Record<LineState, string> = { plain: "bg-white/40", open: "bg-[#B9A4FF]", closed: "bg-white/10" };
const LINE_STROKE: Record<LineState, string> = { plain: "rgb(255 255 255 / 0.4)", open: "#B9A4FF", closed: "rgb(255 255 255 / 0.1)" };

/** The paths between one row of a dungeon map and the next, from the middle of each room. */
function MapLines({ links, state }: { links: MapLink[]; state: (l: MapLink) => LineState }) {
  const x = (slot: number, of: number) => ((slot + 0.5) / of) * 100;
  // Open paths are drawn last, so they sit on top where lines cross.
  const order: LineState[] = ["closed", "plain", "open"];
  const sorted = [...links].sort((a, b) => order.indexOf(state(a)) - order.indexOf(state(b)));
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="block h-5 w-full" aria-hidden="true">
      {sorted.map((l, i) => (
        <line
          key={i}
          x1={x(l.from, l.fromOf)}
          y1={0}
          x2={x(l.to, l.toOf)}
          y2={20}
          stroke={LINE_STROKE[state(l)]}
          strokeWidth={state(l) === "open" ? 2.5 : 2}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function NewGameSheet({ game, onStart, onClose }: { game: Game; onStart: (count: number, start: number) => void; onClose: () => void }) {
  const [count, setCount] = useState(game.players.length);
  const [start, setStart] = useState(game.start);
  const chip = (on: boolean) =>
    "rounded-full border px-3.5 py-1.5 text-sm " +
    (on ? "border-(--color-accent) bg-(--color-accent)/15 text-(--color-text)" : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5");
  useBackToClose(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    // A box in the middle of the table, not a panel from the edge.
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="New game" className="relative w-full max-w-sm space-y-4 rounded-2xl border border-(--color-border) bg-(--color-bg-elev) p-5 shadow-2xl">
        <div className="flex items-center">
          <h2 className="flex-1 text-lg font-semibold text-(--color-text)">New game</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-(--color-text-dim) hover:bg-white/10">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
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
        <p className="text-xs text-(--color-text-dim)">Seats keep their colors. Life, counters, dungeons and history start fresh.</p>
      </div>
    </div>
  );
}
