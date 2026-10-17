import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { dungeonOf } from "../lib/dungeons";
import {
  COLORS,
  COUNTERS,
  colorHex,
  colorInk,
  counterIcon,
  type ColorKey,
  type CounterIcon,
  type CounterKey,
  type Game,
  type MarkerKey,
  type Player,
} from "../lib/life";
import { Icon } from "./Icon";

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
  onSet: (life: number) => void;
  onCounter: (key: CounterKey, by: number) => void;
  onRemoveCounter: (key: CounterKey) => void;
  onCounterIcon: (key: CounterKey, icon: CounterIcon) => void;
  onCmdr: (from: number, by: number) => void;
  onDungeon: () => void;
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
  const [mode, setMode] = useState<"play" | "edit" | "menu">("play");
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
  const cmdr = others.filter((o) => (player.cmdr[o.index] ?? 0) > 0);
  // The total is as big as the seat allows, after room for the crown and counters.
  const crown = monarch || initiative ? Math.max(28, Math.min(64, h * 0.13)) : 0;
  // Three or more counters sit two to a row so the total stays big.
  const counterRows = shown.length > 2 ? Math.ceil(shown.length / 2) : shown.length;
  const below = counterRows * 38 + (cmdr.length || player.dungeon ? 26 : 0);
  const big = Math.max(40, Math.min(240, (h - crown - below - 60) * 0.8, w * 0.36));
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
            {monarch && <Marker icon="crown" label="Monarch" size={crown} />}
            {initiative && <Marker icon="door" label="Initiative" size={crown} onClick={props.onDungeon} />}
          </div>
        )}
        <button
          type="button"
          onClick={() => setMode("edit")}
          title="Tap to type a life total"
          className={"pointer-events-auto font-life leading-[0.95] font-black tabular-nums " + (player.life <= 0 ? "opacity-60 line-through" : "")}
          style={{ fontSize: big }}
          aria-live="polite"
        >
          {player.life}
        </button>
        <div className="h-6 font-life text-lg font-black tabular-nums">{delta !== 0 && (delta > 0 ? `+${delta}` : `−${-delta}`)}</div>

        {shown.length > 0 && (
          <div className={shown.length > 2 ? "grid grid-cols-2 gap-x-3 gap-y-1" : "flex flex-col items-center gap-1"}>
            {shown.map((c) => {
              const v = player.counters[c.key] ?? 0;
              const lethal = !!c.lethal && v >= c.lethal;
              const btn = "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/25 text-xl leading-none active:bg-black/40";
              return (
                <div key={c.key} className="flex items-center gap-2">
                  <button type="button" onClick={() => props.onCounter(c.key, -(c.step ?? 1))} aria-label={`${name}: ${c.label} down`} className={btn}>
                    −
                  </button>
                  <span
                    title={c.label}
                    aria-label={`${c.label} ${v}`}
                    className={"flex min-w-[4.5rem] items-center justify-center gap-1.5 rounded-full px-2 " + (lethal ? "bg-black text-red-300" : "")}
                  >
                    <Icon name={counterIcon(props, c.key)} className="h-5 w-5" />
                    <span className="font-life text-xl font-black tabular-nums">{v}</span>
                  </span>
                  <button type="button" onClick={() => props.onCounter(c.key, c.step ?? 1)} aria-label={`${name}: ${c.label} up`} className={btn}>
                    +
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {(cmdr.length > 0 || player.dungeon) && (
          <div className="mt-1 flex max-w-[80%] flex-wrap justify-center gap-1">
            {player.dungeon && (
              <Chip onClick={props.onDungeon}>
                {dungeonOf(player.dungeon.key).name.split(" ")[0]} · {player.dungeon.room}
              </Chip>
            )}
            {cmdr.map((o) => (
              <Chip key={o.index} onClick={() => setMode("menu")} danger={(player.cmdr[o.index] ?? 0) >= 21}>
                <span className="mr-1 inline-block h-2 w-2 rounded-full ring-1 ring-white/70" style={{ background: colorHex(o.color) }} />
                Cmdr {player.cmdr[o.index]}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {/* Bottom right from this player's side of the table: counters, commander damage, color. */}
      <button
        type="button"
        onClick={() => setMode("menu")}
        aria-label={`${name}: counters, commander damage, dungeon and color`}
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
      {mode === "edit" && <EditLife life={player.life} onSet={props.onSet} onClose={() => setMode("play")} />}
      {mode === "menu" && (
        <Menu
          {...props}
          onDungeon={() => {
            setMode("play");
            props.onDungeon();
          }}
          onClose={() => setMode("play")}
        />
      )}
    </div>
  );
}

const MARKER_TINT = { crown: "#FFD43B", door: "#C9B8FF" } as const;

/** A big table marker above the total: the monarch's gold crown, the initiative's lavender door. */
function Marker({ icon, label, size, onClick }: { icon: "crown" | "door"; label: string; size: number; onClick?: () => void }) {
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
    <button type="button" onClick={onClick} className={"pointer-events-auto " + cls} style={style}>
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

function EditLife({ life, onSet, onClose }: { life: number; onSet: (n: number) => void; onClose: () => void }) {
  const [v, setV] = useState(String(life));
  const save = () => {
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n)) onSet(n);
    onClose();
  };
  return (
    <form
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/85 p-3 text-white"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="text-sm text-white/70" htmlFor="life-exact">
        Set life to
      </label>
      <input
        id="life-exact"
        autoFocus
        type="number"
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        className="w-28 rounded-lg border border-white/30 bg-black px-2 py-2 text-center text-3xl text-white tabular-nums"
      />
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-white/30 px-4 py-1.5 text-sm">
          Cancel
        </button>
        <button type="submit" className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-black">
          Set
        </button>
      </div>
    </form>
  );
}

function Stepper({
  label,
  value,
  onChange,
  danger,
  children,
}: {
  label: React.ReactNode;
  value: number;
  onChange: (by: number) => void;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  const btn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/25 text-lg hover:bg-white/10";
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <button type="button" onClick={() => onChange(-1)} aria-label="Less" className={btn}>
        −
      </button>
      <span className={"w-7 text-center text-base font-semibold tabular-nums " + (danger ? "text-red-400" : "")}>{value}</span>
      <button type="button" onClick={() => onChange(1)} aria-label="More" className={btn}>
        +
      </button>
      {children}
    </div>
  );
}

function Menu(props: Props & { onClose: () => void }) {
  const { name, player, others } = props;
  const head = "text-[11px] font-medium tracking-wide text-white/60 uppercase";
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto overscroll-contain bg-[#14161c] p-3 text-left text-white">
      <div className="mb-2 flex items-center">
        <span className="flex-1 text-sm font-medium">{name}</span>
        <button type="button" onClick={props.onClose} aria-label="Close" className="rounded-full p-1 text-white/70 hover:bg-white/10">
          <Icon name="close" className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-3">
        <section className="space-y-1.5">
          <div className={head}>Counters · any above 0 shows under your life, with − and +</div>
          {COUNTERS.map((c) => {
            const on = player.counters[c.key] !== undefined;
            const v = player.counters[c.key] ?? 0;
            return (
              <Stepper
                key={c.key}
                label={
                  <span className="inline-flex items-center gap-2">
                    <Icon name={counterIcon(props, c.key)} className="h-5 w-5" />
                    {c.label}
                    {c.icons && (
                      // Which symbol this counter shows (poison: Phyrexian or droplet).
                      <span className="ml-1 inline-flex overflow-hidden rounded-md border border-white/20">
                        {c.icons.map((ic) => (
                          <button
                            key={ic}
                            type="button"
                            onClick={() => props.onCounterIcon(c.key, ic)}
                            aria-label={`Show ${c.label} as ${ic}`}
                            aria-pressed={counterIcon(props, c.key) === ic}
                            className={"px-1.5 py-0.5 " + (counterIcon(props, c.key) === ic ? "bg-white/20" : "opacity-50 hover:opacity-100")}
                          >
                            <Icon name={ic} className="h-4 w-4" />
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                }
                value={v}
                danger={!!c.lethal && v >= c.lethal}
                onChange={(by) => props.onCounter(c.key, by * (c.step ?? 1))}
              >
                <button
                  type="button"
                  onClick={() => props.onRemoveCounter(c.key)}
                  aria-label={`Take ${c.label} off the screen`}
                  className={"rounded p-1 hover:bg-white/10 " + (on ? "text-white/60" : "invisible")}
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </Stepper>
            );
          })}
        </section>

        <section className="space-y-1.5">
          <div className={head}>Dungeon</div>
          <button type="button" onClick={props.onDungeon} className="w-full rounded-lg border border-white/25 px-3 py-2 text-left text-sm hover:bg-white/10">
            {player.dungeon ? `${dungeonOf(player.dungeon.key).name} · ${player.dungeon.room}` : "Dungeons and the initiative"}
          </button>
        </section>

        <section className="space-y-1.5">
          <div className={head}>Commander damage taken (also takes life)</div>
          {others.map((o) => (
            <Stepper
              key={o.index}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorHex(o.color) }} />
                  from {o.name}
                </span>
              }
              value={player.cmdr[o.index] ?? 0}
              danger={(player.cmdr[o.index] ?? 0) >= 21}
              onChange={(by) => props.onCmdr(o.index, by)}
            />
          ))}
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
