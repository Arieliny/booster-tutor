import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { dungeonOf } from "../lib/dungeons";
import { COLORS, COUNTERS, MARKERS, colorHex, colorInk, type ColorKey, type CounterKey, type MarkerKey, type Player } from "../lib/life";
import { Icon } from "./Icon";

/** How far a seat's panel is turned so it faces its player (0 = upright for the phone's owner). */
export type Turn = 0 | 90 | 180 | 270;

/**
 * Lays its child out in a frame turned to face a seat: at 90/270 the frame's
 * width and height swap, so the content still fills the cell.
 */
function Turned({ turn, children }: { turn: Turn; children: (w: number, h: number) => React.ReactNode }) {
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
  name: string;
  player: Player;
  turn: Turn;
  /** The other seats, for commander damage. */
  others: { index: number; name: string; color: ColorKey }[];
  markers: Partial<Record<MarkerKey, number>>;
  index: number;
  highlight: "first" | "spin" | null;
  /** Giving out the monarch or the initiative: what to say, and the tap that picks this seat. */
  picking: string | null;
  onPick: () => void;
  onLife: (by: number) => void;
  onSet: (life: number) => void;
  onCounter: (key: CounterKey, by: number) => void;
  onAddCounter: (key: CounterKey) => void;
  onRemoveCounter: (key: CounterKey) => void;
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
  const { name, player, w, h, highlight, markers, index, others, picking } = props;
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

  // As big as the seat allows: three digits still fit across.
  const big = Math.max(44, Math.min(240, h * 0.5, w * 0.36));
  const shown = COUNTERS.filter((c) => player.counters[c.key] !== undefined);
  const held = MARKERS.filter((m) => markers[m.key] === index);
  const cmdr = others.filter((o) => (player.cmdr[o.index] ?? 0) > 0);
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
        <div className="text-[11px] font-semibold tracking-wide uppercase opacity-80">{highlight === "first" ? "Goes first" : name}</div>
        <button
          type="button"
          onClick={() => setMode("edit")}
          title="Tap to type a life total"
          className={"pointer-events-auto leading-[0.95] font-bold tabular-nums " + (player.life <= 0 ? "opacity-60 line-through" : "")}
          style={{ fontSize: big }}
          aria-live="polite"
        >
          {player.life}
        </button>
        <div className="h-6 text-lg font-semibold tabular-nums">{delta !== 0 && (delta > 0 ? `+${delta}` : `−${-delta}`)}</div>
        {(shown.length > 0 || held.length > 0 || cmdr.length > 0 || player.dungeon) && (
          <div className="flex max-w-[80%] flex-wrap justify-center gap-1">
            {held.map((m) => (
              <Chip key={m.key} onClick={m.key === "initiative" ? props.onDungeon : () => setMode("menu")}>
                <Icon name={m.key === "monarch" ? "crown" : "door"} className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                {m.label}
              </Chip>
            ))}
            {player.dungeon && (
              <Chip onClick={props.onDungeon}>
                {dungeonOf(player.dungeon.key).name.split(" ")[0]} · {player.dungeon.room}
              </Chip>
            )}
            {shown.map((c) => {
              const v = player.counters[c.key] ?? 0;
              return (
                <Chip key={c.key} onClick={() => setMode("menu")} danger={!!c.lethal && v >= c.lethal}>
                  {c.label} {v}
                </Chip>
              );
            })}
            {cmdr.map((o) => (
              <Chip key={o.index} onClick={() => setMode("menu")} danger={(player.cmdr[o.index] ?? 0) >= 21}>
                <span className="mr-1 inline-block h-2 w-2 rounded-full ring-1 ring-white/70" style={{ background: colorHex(o.color) }} />
                Cmdr {player.cmdr[o.index]}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setMode("menu")}
        aria-label={`${name}: counters, commander damage, dungeon and color`}
        className="absolute top-1 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 opacity-70 hover:bg-black/10 hover:opacity-100"
      >
        <Icon name="more" className="h-5 w-5" />
      </button>

      {player.completed ? (
        <div className="absolute right-2 bottom-1.5 text-[11px] font-medium opacity-75">
          {player.completed} dungeon{player.completed === 1 ? "" : "s"} done
        </div>
      ) : null}

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
  const shown = COUNTERS.filter((c) => player.counters[c.key] !== undefined);
  const hidden = COUNTERS.filter((c) => player.counters[c.key] === undefined);
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
          <div className={head}>Counters</div>
          {shown.map((c) => {
            const v = player.counters[c.key] ?? 0;
            return (
              <Stepper key={c.key} label={c.label} value={v} danger={!!c.lethal && v >= c.lethal} onChange={(by) => props.onCounter(c.key, by * (c.step ?? 1))}>
                <button type="button" onClick={() => props.onRemoveCounter(c.key)} aria-label={`Hide ${c.label}`} className="rounded p-1 text-white/60 hover:bg-white/10">
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </Stepper>
            );
          })}
          {hidden.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hidden.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => props.onAddCounter(c.key)}
                  className="rounded-full border border-dashed border-white/30 px-2.5 py-1 text-xs text-white/75 hover:bg-white/10"
                >
                  + {c.label}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-1.5">
          <div className={head}>Dungeon</div>
          <button type="button" onClick={props.onDungeon} className="w-full rounded-lg border border-white/25 px-3 py-2 text-left text-sm hover:bg-white/10">
            {player.dungeon ? `${dungeonOf(player.dungeon.key).name} · ${player.dungeon.room}` : "Venture into the dungeon"}
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
