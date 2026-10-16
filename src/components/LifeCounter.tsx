import { useEffect, useRef, useState } from "react";
import { DUNGEONS, INITIATIVE_TEXT, dungeonOf, firstRoom, isLastRoom, type DungeonKey } from "../lib/dungeons";
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
  setColor,
  setLife,
  undo,
  untouched,
  type Entry,
  type Game,
  type MarkerKey,
} from "../lib/life";
import { Icon, type IconName } from "./Icon";
import { LifePanel, type Turn } from "./LifePanel";
import { Sheet } from "./Sheet";

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

type SheetKind = { kind: "history" } | { kind: "dice" } | { kind: "new" } | { kind: "dungeon"; p: number };

export function LifeCounter({ onExit }: { onExit: () => void }) {
  const [game, setGame] = useState<Game>(load);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [barOpen, setBarOpen] = useState(false);
  const [giving, setGiving] = useState<MarkerKey | null>(null);
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

  /** Someone was picked to take the monarch or the initiative. */
  const pick = (i: number) => {
    const key = giving;
    setGiving(null);
    if (!key) return;
    if (key === "monarch") {
      setGame((g) => giveMarker(g, i, "monarch"));
      return;
    }
    // Taking the initiative ventures into Undercity: a player outside any
    // dungeon enters it; one already in a dungeon picks their next room.
    setGame((g) => {
      const g2 = giveMarker(g, i, "initiative");
      return g2.players[i].dungeon ? g2 : enterRoom(g2, i, "undercity", firstRoom("undercity"));
    });
    setSheet({ kind: "dungeon", p: i });
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
                others={game.players.flatMap((o, j) => (j === i ? [] : [{ index: j, name: seatName(n, j), color: o.color }]))}
                highlight={first === i ? "first" : spin === i ? "spin" : null}
                picking={giving ? (giving === "monarch" ? "Becomes the monarch" : "Takes the initiative") : null}
                onPick={() => pick(i)}
                onLife={(by) => setGame((g) => changeLife(g, i, by))}
                onSet={(life) => setGame((g) => setLife(g, i, life))}
                onCounter={(key, by) => setGame((g) => changeCounter(g, i, key, by))}
                onAddCounter={(key) => setGame((g) => addCounter(g, i, key))}
                onRemoveCounter={(key) => setGame((g) => removeCounter(g, i, key))}
                onCmdr={(from, by) => setGame((g) => changeCmdr(g, i, from, by))}
                onDungeon={() => setSheet({ kind: "dungeon", p: i })}
                onColor={(c) => setGame((g) => setColor(g, i, c))}
              />
            </div>
          ))}
        </div>

        {/* The middle button, which slides open into the tools bar. */}
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
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
              className="pointer-events-auto flex items-center overflow-hidden rounded-full border-4 border-black bg-[#14161c] transition-[width] duration-200 ease-out"
              style={{ width: barOpen ? "min(calc(100vw - 1rem), 36rem)" : "3.75rem", height: "3.75rem" }}
            >
              <div className={"flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden transition-opacity duration-150 " + (barOpen ? "opacity-100" : "pointer-events-none opacity-0")}>
                <Tool icon="exit" label="Exit" onClick={onExit} />
                <Tool icon="undo" label="Undo" onClick={() => setGame(undo)} disabled={!game.history.length} />
                <Tool icon="history" label="History" onClick={() => setSheet({ kind: "history" })} />
                <Tool icon="refresh" label="New game" onClick={() => setSheet({ kind: "new" })} />
              </div>
              <button
                type="button"
                onClick={() => setBarOpen((o) => !o)}
                aria-label={barOpen ? "Close the tools" : "Open the tools"}
                aria-expanded={barOpen}
                className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-full bg-white text-black"
              >
                <Icon name={barOpen ? "close" : "menu"} className="h-6 w-6" />
              </button>
              <div className={"flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden transition-opacity duration-150 " + (barOpen ? "opacity-100" : "pointer-events-none opacity-0")}>
                <Tool icon="crown" label="Monarch" tint="#F5C04A" onClick={() => (setBarOpen(false), setGiving("monarch"))} />
                <Tool icon="door" label="Initiative" tint="#B9A4FF" onClick={() => (setBarOpen(false), setGiving("initiative"))} />
                <Tool icon="target" label="Who's first" onClick={whoGoesFirst} />
                <Tool icon="dice" label="Dice" onClick={() => setSheet({ kind: "dice" })} />
              </div>
            </div>
          )}
        </div>
      </div>

      {sheet?.kind === "history" && <HistorySheet game={game} onUndo={() => setGame(undo)} onClose={() => setSheet(null)} />}
      {sheet?.kind === "dice" && <DiceSheet onClose={() => setSheet(null)} />}
      {sheet?.kind === "dungeon" && (
        <DungeonSheet
          game={game}
          p={sheet.p}
          name={seatName(n, sheet.p)}
          onEnter={(key, room) => setGame((g) => enterRoom(g, sheet.p, key, room))}
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
function Tool({ icon, label, onClick, tint, disabled }: { icon: IconName; label: string; onClick: () => void; tint?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
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
    case "cmdr":
      return e.d > 0
        ? `${who} took ${e.d} commander damage from ${seatName(n, e.from ?? 0)} → ${lifeAfter(g, index)}`
        : `${who}: ${-e.d} commander damage from ${seatName(n, e.from ?? 0)} taken back → ${lifeAfter(g, index)}`;
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

const SIDES = [4, 6, 8, 10, 12, 20];

function DiceSheet({ onClose }: { onClose: () => void }) {
  const [sides, setSides] = useState(20);
  const [result, setResult] = useState<{ what: string; value: number | string } | null>(null);
  const chip = (on: boolean) =>
    "rounded-full border px-3.5 py-1.5 text-sm " +
    (on ? "border-(--color-accent) bg-(--color-accent)/15 text-(--color-text)" : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5");
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setResult({ what: `d${sides}`, value: rollDice(1, sides)[0] })}
            className="flex-1 rounded-lg bg-(--color-accent) py-3 text-base font-semibold text-black hover:bg-(--color-accent-bright)"
          >
            Roll a d{sides}
          </button>
          <button
            type="button"
            onClick={() => setResult({ what: "Coin", value: Math.random() < 0.5 ? "Heads" : "Tails" })}
            className="rounded-lg border border-(--color-border) px-4 py-3 text-base text-(--color-text) hover:bg-white/5"
          >
            Flip a coin
          </button>
        </div>
        {result && (
          <div className="rounded-xl border border-(--color-border) bg-(--color-bg) p-4 text-center" aria-live="polite">
            <div className="text-xs text-(--color-text-dim)">{result.what}</div>
            <div className="mt-1 text-5xl font-semibold text-(--color-text) tabular-nums">{result.value}</div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function DungeonSheet({
  game,
  p,
  name,
  onEnter,
  onComplete,
  onClose,
}: {
  game: Game;
  p: number;
  name: string;
  onEnter: (key: DungeonKey, room: string) => void;
  onComplete: () => void;
  onClose: () => void;
}) {
  const player = game.players[p];
  const cur = player.dungeon;
  const hex = colorHex(player.color);
  const [choosing, setChoosing] = useState<DungeonKey | null>(null);
  const shown = cur?.key ?? choosing;
  const d = shown ? dungeonOf(shown) : null;
  const next = cur ? (d?.rooms[cur.room]?.next ?? []) : d ? [d.rows[0][0]] : [];
  const holdsInitiative = game.markers.initiative === p;

  return (
    <Sheet title={`${name} · ${d ? d.name : "Venture into the dungeon"}`} onClose={onClose}>
      {!d ? (
        <div className="space-y-2">
          {player.completed ? <p className="text-sm text-(--color-text-dim)">Dungeons completed this game: {player.completed}</p> : null}
          <p className="text-sm text-(--color-text-dim)">Pick a dungeon to enter. You start in its first room.</p>
          {DUNGEONS.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => setChoosing(x.key)}
              className="block w-full rounded-lg border border-(--color-border) px-3 py-2.5 text-left hover:bg-white/5"
            >
              <span className="block text-sm font-medium text-(--color-text)">{x.name}</span>
              <span className="block text-xs text-(--color-text-dim)">
                {x.note ?? `${Object.keys(x.rooms).length} rooms`} · starts with {x.rooms[x.rows[0][0]].effect.replace(/\.$/, "").toLowerCase()}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-(--color-text-dim)">
            {cur
              ? isLastRoom(cur.key, cur.room)
                ? "Last room. Once its ability resolves, the dungeon is complete."
                : "Tap the room you venture into next."
              : "Tap the first room to enter."}
          </p>
          {d.key === "undercity" && holdsInitiative && <p className="rounded-lg bg-white/5 p-2 text-xs text-(--color-text-dim)">{INITIATIVE_TEXT}</p>}
          <div className="space-y-2">
            {d.rows.map((row, r) => (
              <div key={r} className="flex gap-2">
                {row.map((roomName) => {
                  const room = d.rooms[roomName];
                  const here = cur?.room === roomName;
                  const canGo = next.includes(roomName);
                  return (
                    <button
                      key={roomName}
                      type="button"
                      disabled={!canGo}
                      onClick={() => onEnter(d.key, roomName)}
                      className={
                        "min-w-0 flex-1 rounded-lg border p-2 text-left transition-colors " +
                        (here ? "border-2" : canGo ? "border-dashed border-(--color-accent) hover:bg-(--color-accent)/10" : "border-(--color-border) opacity-55")
                      }
                      style={here ? { borderColor: hex, background: `color-mix(in srgb, ${hex} 18%, transparent)` } : undefined}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-(--color-text)">
                        {here && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: hex }} />}
                        {roomName}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-(--color-text-dim)">{room.effect}</span>
                      {canGo && <span className="mt-1 block text-[11px] font-medium text-(--color-accent)">Venture here</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {cur && isLastRoom(cur.key, cur.room) && (
            <button type="button" onClick={onComplete} className="w-full rounded-lg bg-(--color-accent) py-2.5 text-sm font-semibold text-black hover:bg-(--color-accent-bright)">
              Complete the dungeon
            </button>
          )}
          {!cur && (
            <button type="button" onClick={() => setChoosing(null)} className="text-sm text-(--color-text-dim) hover:underline">
              ← Other dungeons
            </button>
          )}
        </div>
      )}
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
        <p className="text-xs text-(--color-text-dim)">Seats keep their colors. Life, counters, dungeons and history start fresh.</p>
      </div>
    </Sheet>
  );
}
