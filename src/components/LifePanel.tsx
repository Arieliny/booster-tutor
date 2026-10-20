import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { dungeonOf } from "../lib/dungeons";
import {
  COLORS,
  COUNTERS,
  colorHex,
  colorInk,
  counterIcon,
  type ColorKey,
  type CounterDef,
  type CounterIcon,
  type CounterKey,
  type Game,
  type MarkerKey,
  type Player,
} from "../lib/life";
import { Icon } from "./Icon";
import { Pip } from "./ManaCost";

/** How far a seat's panel is turned so it faces its player (0 = upright for the phone's owner). */
export type Turn = 0 | 90 | 180 | 270;

/**
 * Lays its child out in a frame turned to face a seat: at 90/270 the frame's
 * width and height swap, so the content still fills the space.
 */
export function Turned({ turn, children }: { turn: Turn; children: (w: number, h: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sideways = turn === 90 || turn === 270;
  const w = sideways ? size.h : size.w;
  const h = sideways ? size.w : size.h;
  return (
    <div ref={ref} className="relative h-full w-full">
      {size.w > 0 && (
        <div className="absolute top-1/2 left-1/2" style={{ width: w, height: h, transform: `translate(-50%, -50%) rotate(${turn}deg)` }}>
          {children(w, h)}
        </div>
      )}
    </div>
  );
}

/** Tap = ±1 on release; hold = ±10 after a moment, repeating while held. */
function useHold(step: (by: number) => void, sign: 1 | -1) {
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const stop = (commit: boolean) => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (commit && !held.current) stepRef.current(sign);
  };
  return {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      held.current = false;
      window.clearTimeout(timer.current);
      const tick = () => {
        held.current = true;
        stepRef.current(10 * sign);
        timer.current = window.setTimeout(tick, 700);
      };
      timer.current = window.setTimeout(tick, 450);
    },
    onPointerUp: () => stop(true),
    // The browser took the touch for a scroll, or the finger slid off: no change.
    onPointerCancel: () => stop(false),
    onPointerLeave: () => stop(false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        stepRef.current(sign);
      }
    },
  };
}

interface Props {
  /** For screen readers and menus; not shown on the panel (it faces its player). */
  name: string;
  player: Player;
  turn: Turn;
  /** The other seats, for commander damage. */
  others: { index: number; name: string; color: ColorKey }[];
  markers: Partial<Record<MarkerKey, number>>;
  /** The game's chosen counter symbols. */
  icons: Game["icons"];
  index: number;
  highlight: "first" | "spin" | null;
  /** The middle tray is open: show this seat's door to the dungeon tracker. */
  trayOpen: boolean;
  /** Giving out the monarch: what to say, and the tap that picks this seat. */
  picking: string | null;
  onPick: () => void;
  onLife: (by: number) => void;
  onCounter: (key: CounterKey, by: number) => void;
  onAddCounter: (key: CounterKey) => void;
  onRemoveCounter: (key: CounterKey) => void;
  onCounterIcon: (key: CounterKey, icon: CounterIcon) => void;
  /** The ... menu is opening (the tray closes so it doesn't cover the menu). */
  onMenu: () => void;
  onCmdr: (from: number, by: number) => void;
  onAddCmdr: (from: number) => void;
  onRemoveCmdr: (from: number) => void;
  onDungeon: () => void;
  /** Tap the crown: the monarch goes to the next player. */
  onPassMonarch: () => void;
  onColor: (c: ColorKey) => void;
}

export function LifePanel(props: Props) {
  const { name, player, turn, highlight } = props;
  return (
    <div
      className={
        "relative h-full min-h-0 overflow-hidden rounded-2xl transition-shadow " +
        (highlight === "first" ? "ring-4 ring-white" : highlight === "spin" ? "ring-2 ring-white/70" : "")
      }
      style={{ background: colorHex(player.color), color: colorInk(player.color) }}
      aria-label={name}
    >
      <Turned turn={turn}>{(w, h) => <Face {...props} w={w} h={h} key={name} />}</Turned>
      {highlight === "first" && <span className="sr-only">{name} goes first</span>}
    </div>
  );
}

function Face(props: Props & { w: number; h: number }) {
  const { name, player, w, h, highlight, markers, index, others, picking, trayOpen } = props;
  const [delta, setDelta] = useState(0);
  const [mode, setMode] = useState<"play" | "menu">("play");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const step = (by: number) => {
    props.onLife(by);
    setDelta((d) => d + by);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDelta(0), 1500);
  };
  const minus = useHold(step, -1);
  const plus = useHold(step, 1);

  const monarch = markers.monarch === index;
  const initiative = markers.initiative === index;
  const shown = COUNTERS.filter((c) => player.counters[c.key] !== undefined);
  // Commander damage switched on in the menu, one row per opponent (their color on the sword).
  const cmdr = others.filter((o) => player.cmdr[o.index] !== undefined);
  // The total is as big as the seat allows, after room for the crown and counters.
  const crown = monarch || initiative ? Math.max(28, Math.min(64, h * 0.13)) : 0;
  // Three or more rows (counters and commander damage) sit two to a row so the total stays big.
  const tracked = shown.length + cmdr.length;
  const counterRows = tracked > 2 ? Math.ceil(tracked / 2) : tracked;
  const below = counterRows * 38 + (player.dungeon ? 26 : 0);
  // Two digits get half the seat's width; three (or a minus sign) shrink so they stay clear of - and +.
  const chars = String(player.life).length;
  const big = Math.max(40, Math.min(300, (h - crown - below - 50) * 0.9, w * (chars >= 3 ? 0.33 : 0.5)));
  const half = "flex h-full flex-1 items-center text-4xl opacity-45 select-none touch-manipulation active:bg-black/10";

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 flex">
        <button type="button" aria-label={`${name}: lose 1 life (hold for 10)`} className={`${half} justify-start pl-4`} {...minus}>
          −
        </button>
        <button type="button" aria-label={`${name}: gain 1 life (hold for 10)`} className={`${half} justify-end pr-4`} {...plus}>
          +
        </button>
      </div>

      {/* Over the tap halves; only its buttons take taps. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {highlight === "first" && <div className="mb-1 text-xs font-bold tracking-wide uppercase">Goes first</div>}
        {crown > 0 && (
          <div className="mb-1 flex items-end gap-5">
            {monarch && <Marker icon="crown" label="Monarch" size={crown} onClick={props.onPassMonarch} title="Pass the monarch to the next player" />}
            {initiative && <Marker icon="door" label="Initiative" size={crown} onClick={props.onDungeon} title="Open the dungeons" />}
          </div>
        )}
        <div
          className={"font-life leading-[0.95] font-black tabular-nums " + (player.life <= 0 ? "opacity-60 line-through" : "")}
          style={{ fontSize: big }}
          aria-live="polite"
          data-life
        >
          {player.life}
        </div>
        <div className="h-6 font-life text-lg font-black tabular-nums">{delta !== 0 && (delta > 0 ? `+${delta}` : `−${-delta}`)}</div>

        {tracked > 0 && (
          <div className={tracked > 2 ? "grid grid-cols-2 gap-x-3 gap-y-1" : "flex flex-col items-center gap-1"}>
            {shown.map((c) => {
              const v = player.counters[c.key] ?? 0;
              return (
                <TrackRow
                  key={c.key}
                  label={c.label}
                  value={v}
                  lethal={!!c.lethal && v >= c.lethal}
                  icon={<CounterSymbol c={c} icons={props.icons} size={20} />}
                  onDown={() => props.onCounter(c.key, -(c.step ?? 1))}
                  onUp={() => props.onCounter(c.key, c.step ?? 1)}
                  who={name}
                />
              );
            })}
            {cmdr.map((o) => {
              const v = player.cmdr[o.index] ?? 0;
              return (
                <TrackRow
                  key={`cmdr-${o.index}`}
                  label={`Commander damage from ${o.name}`}
                  value={v}
                  lethal={v >= 21}
                  icon={
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/45" style={{ color: colorHex(o.color) }}>
                      <Icon name="sword" className="h-4 w-4" />
                    </span>
                  }
                  onDown={() => props.onCmdr(o.index, -1)}
                  onUp={() => props.onCmdr(o.index, 1)}
                  who={name}
                />
              );
            })}
          </div>
        )}

        {player.dungeon && (
          <div className="mt-1 flex max-w-[80%] flex-wrap justify-center gap-1">
            <Chip onClick={props.onDungeon}>
              {dungeonOf(player.dungeon.key).name.split(" ")[0]} · {player.dungeon.room}
            </Chip>
          </div>
        )}
      </div>

      {/* Bottom right from this player's side of the table: counters, commander damage, color. */}
      <button
        type="button"
        onClick={() => {
          props.onMenu();
          setMode("menu");
        }}
        aria-label={`${name}: counters, commander damage and color`}
        className="absolute right-1.5 bottom-1.5 rounded-full px-2.5 py-1.5 opacity-75 hover:bg-black/10 hover:opacity-100"
      >
        <Icon name="more" className="h-6 w-6" />
      </button>

      {player.completed ? (
        <div className="absolute bottom-2.5 left-3 text-[11px] font-medium opacity-75">
          {player.completed} dungeon{player.completed === 1 ? "" : "s"} done
        </div>
      ) : null}

      {/* With the tray open, each seat gets a door to the dungeon tracker, facing them. */}
      {trayOpen && !picking && (
        <button
          type="button"
          onClick={props.onDungeon}
          aria-label={`${name}: dungeons and the initiative`}
          className="absolute top-11 left-1/2 flex -translate-x-1/2 flex-col items-center rounded-2xl bg-black/35 px-4 py-2 text-white"
        >
          <Icon name="door" className="h-7 w-7" />
          <span className="text-[11px] font-semibold">Dungeons</span>
        </button>
      )}

      {picking && (
        <button
          type="button"
          onClick={props.onPick}
          className="absolute inset-0 z-20 flex items-end justify-center bg-black/25 pb-3 text-sm font-semibold text-white ring-4 ring-white/80 ring-inset"
        >
          {picking}
        </button>
      )}
      {mode === "menu" && <Menu {...props} onClose={() => setMode("play")} />}
    </div>
  );
}

const MARKER_TINT = { crown: "#FFD43B", door: "#C9B8FF" } as const;

/** A big table marker above the total: the monarch's gold crown, the initiative's lavender door. */
function Marker({ icon, label, size, onClick, title }: { icon: "crown" | "door"; label: string; size: number; onClick?: () => void; title?: string }) {
  const inner = (
    <>
      <span style={{ width: size, height: size }} className="block">
        <Icon name={icon} className="h-full w-full" />
      </span>
      <span className="mt-0.5 text-[11px] font-bold tracking-wide uppercase">{label}</span>
    </>
  );
  const cls = "flex flex-col items-center rounded-2xl bg-black/40 px-3 pt-1.5 pb-1 leading-none";
  const style = { color: MARKER_TINT[icon] };
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={title} title={title} className={"pointer-events-auto " + cls} style={style}>
      {inner}
    </button>
  ) : (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}

function Chip({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={"pointer-events-auto rounded-full px-2 py-0.5 text-[11px] font-semibold " + (danger ? "bg-black text-red-300" : "bg-black/30 text-white")}
    >
      {children}
    </button>
  );
}

/** A counter's symbol: its mana pip, or its icon (poison can be Phyrexian or a droplet). */
function CounterSymbol({ c, icons, size }: { c: CounterDef; icons: Props["icons"]; size: number }) {
  if (c.pip) return <Pip sym={c.pip} size={size} />;
  return (
    <span className="block shrink-0" style={{ width: size, height: size }}>
      <Icon name={counterIcon({ icons }, c.key)} className="h-full w-full" />
    </span>
  );
}

/** A counter or commander damage under the total: - [symbol value] +. */
function TrackRow({
  label,
  value,
  lethal,
  icon,
  onDown,
  onUp,
  who,
}: {
  label: string;
  value: number;
  lethal: boolean;
  icon: React.ReactNode;
  onDown: () => void;
  onUp: () => void;
  who: string;
}) {
  const btn = "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/25 text-xl leading-none active:bg-black/40";
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onDown} aria-label={`${who}: ${label} down`} className={btn}>
        −
      </button>
      <span
        title={label}
        aria-label={`${label} ${value}`}
        className={"flex min-w-[4.5rem] items-center justify-center gap-1.5 rounded-full px-2 " + (lethal ? "bg-black text-red-300" : "")}
      >
        {icon}
        <span className="font-life text-xl font-black tabular-nums">{value}</span>
      </span>
      <button type="button" onClick={onUp} aria-label={`${who}: ${label} up`} className={btn}>
        +
      </button>
    </div>
  );
}

function Menu(props: Props & { onClose: () => void }) {
  const { name, player, others } = props;
  const head = "text-[11px] font-medium tracking-wide text-white/60 uppercase";
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto overscroll-contain bg-[#14161c] px-3 pb-3 text-left text-white">
      {/* Stays at the top while the menu scrolls, so x is always in reach. */}
      <div className="sticky top-0 z-10 -mx-3 mb-2 flex items-center bg-[#14161c] px-3 pt-3 pb-2">
        <span className="flex-1 text-sm font-medium">{name}</span>
        <button type="button" onClick={props.onClose} aria-label="Close" className="rounded-full p-1 text-white/70 hover:bg-white/10">
          <Icon name="close" className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-3">
        <section className="space-y-1.5">
          <div className={head}>Counters on your life card</div>
          <div className="grid grid-cols-2 gap-1.5">
            {COUNTERS.filter((c) => !c.pip).map((c) => {
              const on = player.counters[c.key] !== undefined;
              return (
                <div key={c.key} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => (on ? props.onRemoveCounter(c.key) : props.onAddCounter(c.key))}
                    aria-pressed={on}
                    className={
                      "flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm " +
                      (on ? "border-white bg-white/15" : "border-white/20 text-white/75 hover:bg-white/10")
                    }
                  >
                    <Icon name={counterIcon(props, c.key)} className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    {on && <Icon name="check" className="h-4 w-4 shrink-0" />}
                  </button>
                  {c.icons && (
                    // Which symbol this counter shows (poison: Phyrexian or droplet).
                    <span className="flex flex-col overflow-hidden rounded-lg border border-white/20">
                      {c.icons.map((ic) => (
                        <button
                          key={ic}
                          type="button"
                          onClick={() => props.onCounterIcon(c.key, ic)}
                          aria-label={`Show ${c.label} as ${ic}`}
                          aria-pressed={counterIcon(props, c.key) === ic}
                          className={"flex flex-1 items-center px-1.5 " + (counterIcon(props, c.key) === ic ? "bg-white/20" : "opacity-50 hover:opacity-100")}
                        >
                          <Icon name={ic} className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-1.5">
          <div className={head}>Unspent mana</div>
          <div className="flex flex-wrap gap-1.5">
            {COUNTERS.filter((c) => c.pip).map((c) => {
              const on = player.counters[c.key] !== undefined;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => (on ? props.onRemoveCounter(c.key) : props.onAddCounter(c.key))}
                  aria-pressed={on}
                  aria-label={c.label}
                  title={c.label}
                  className={
                    "flex h-11 w-11 items-center justify-center rounded-lg border " +
                    (on ? "border-white bg-white/15" : "border-white/20 opacity-60 hover:bg-white/10 hover:opacity-100")
                  }
                >
                  <Pip sym={c.pip!} size={26} />
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-1.5">
          <div className={head}>Commander damage on your life card</div>
          <div className="grid grid-cols-2 gap-1.5">
            {others.map((o) => {
              const on = player.cmdr[o.index] !== undefined;
              return (
                <button
                  key={o.index}
                  type="button"
                  onClick={() => (on ? props.onRemoveCmdr(o.index) : props.onAddCmdr(o.index))}
                  aria-pressed={on}
                  className={
                    "flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm " +
                    (on ? "border-white bg-white/15" : "border-white/20 text-white/75 hover:bg-white/10")
                  }
                >
                  <Icon name="sword" className="h-5 w-5 shrink-0" />
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colorHex(o.color) }} />
                  <span className="min-w-0 flex-1 truncate">From {o.name}</span>
                  {on && <Icon name="check" className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-1.5">
          <div className={head}>Color</div>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => props.onColor(c.key)}
                aria-label={c.label}
                aria-pressed={player.color === c.key}
                className={"h-8 w-8 rounded-full border-2 " + (player.color === c.key ? "border-white" : "border-transparent")}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
