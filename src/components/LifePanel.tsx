import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { COLORS, COUNTERS, MARKERS, colorHex, type ColorKey, type CounterKey, type MarkerKey, type Player } from "../lib/life";
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
        <div
          className="absolute top-1/2 left-1/2"
          style={{ width: w, height: h, transform: `translate(-50%, -50%) rotate(${turn}deg)` }}
        >
          {children(w, h)}
        </div>
      )}
    </div>
  );
}

/** Tap = ±1 on release; hold = ±5 after a moment, repeating while held. */
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
        stepRef.current(5 * sign);
        timer.current = window.setTimeout(tick, 600);
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
  onLife: (by: number) => void;
  onSet: (life: number) => void;
  onCounter: (key: CounterKey, by: number) => void;
  onAddCounter: (key: CounterKey) => void;
  onRemoveCounter: (key: CounterKey) => void;
  onCmdr: (from: number, by: number) => void;
  onMarker: (key: MarkerKey) => void;
  onColor: (c: ColorKey) => void;
}

export function LifePanel(props: Props) {
  const { name, player, turn, highlight } = props;
  const hex = colorHex(player.color);
  return (
    <div
      className={
        "relative h-full min-h-0 overflow-hidden rounded-2xl border transition-shadow " +
        (highlight === "first" ? "ring-4 ring-(--color-accent)" : highlight === "spin" ? "ring-2 ring-white/60" : "")
      }
      style={{
        borderColor: `color-mix(in srgb, ${hex} 55%, transparent)`,
        background: `color-mix(in srgb, ${hex} 22%, var(--color-bg-elev))`,
      }}
      aria-label={name}
    >
      <Turned turn={turn}>{(w, h) => <Face {...props} w={w} h={h} key={name} />}</Turned>
      {highlight === "first" && <span className="sr-only">{name} goes first</span>}
    </div>
  );
}

function Face(props: Props & { w: number; h: number }) {
  const { name, player, w, h, highlight, markers, index, others } = props;
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
  const plus = useHold(step, 1);
  const minus = useHold(step, -1);

  const big = Math.max(36, Math.min(150, Math.min(w, h) * 0.42));
  const compact = h < 200;
  const shown = COUNTERS.filter((c) => player.counters[c.key] !== undefined);
  const held = MARKERS.filter((m) => markers[m.key] === index);
  const cmdr = others.filter((o) => (player.cmdr[o.index] ?? 0) > 0);
  // In a small seat the +/- hints move to the corners, clear of the name.
  const half =
    "flex w-full flex-1 text-2xl text-white/35 select-none touch-manipulation active:bg-white/5 " +
    (compact ? "justify-end pr-3" : "justify-center");

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 flex flex-col">
        <button type="button" aria-label={`${name}: gain 1 life (hold for 5)`} className={`${half} items-start ${compact ? "pt-1" : "pt-2"}`} {...plus}>
          +
        </button>
        <button type="button" aria-label={`${name}: lose 1 life (hold for 5)`} className={`${half} items-end ${compact ? "pb-1" : "pb-2"}`} {...minus}>
          −
        </button>
      </div>

      {/* Over the tap halves; only its buttons take taps. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <div className="text-[11px] font-medium tracking-wide text-white/70 uppercase">
          {highlight === "first" ? "Goes first" : name}
        </div>
        <button
          type="button"
          onClick={() => setMode("edit")}
          title="Tap to type a life total"
          className={
            "pointer-events-auto leading-none font-semibold tabular-nums " + (player.life <= 0 ? "text-red-400" : "text-white")
          }
          style={{ fontSize: big }}
          aria-live="polite"
        >
          {player.life}
        </button>
        <div className={"h-5 text-base font-medium tabular-nums " + (delta > 0 ? "text-emerald-300" : "text-red-300")}>
          {delta !== 0 && (delta > 0 ? `+${delta}` : `−${-delta}`)}
        </div>
        {(shown.length > 0 || held.length > 0 || cmdr.length > 0) && (
          <div className={"flex max-w-[92%] flex-wrap justify-center gap-1 " + (compact ? "mt-0" : "mt-1")}>
            {held.map((m) => (
              <Chip key={m.key} onClick={() => setMode("menu")}>
                {m.label}
              </Chip>
            ))}
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
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: colorHex(o.color) }} />
                Cmdr {player.cmdr[o.index]}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setMode("menu")}
        aria-label={`${name}: counters, commander damage and color`}
        className="absolute top-1.5 left-1.5 rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
      >
        <Icon name="more" className="h-5 w-5" />
      </button>

      {mode === "edit" && <EditLife life={player.life} onSet={props.onSet} onClose={() => setMode("play")} />}
      {mode === "menu" && <Menu {...props} onClose={() => setMode("play")} />}
    </div>
  );
}

function Chip({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "pointer-events-auto rounded-full px-2 py-0.5 text-[11px] font-medium " +
        (danger ? "bg-red-500/80 text-white" : "bg-black/35 text-white/90")
      }
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
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-(--color-bg-elev)/95 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="text-sm text-(--color-text-dim)" htmlFor="life-exact">
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
        className="w-28 rounded-lg border border-(--color-border) bg-(--color-bg) px-2 py-2 text-center text-3xl text-(--color-text) tabular-nums"
      />
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-(--color-border) px-4 py-1.5 text-sm text-(--color-text)">
          Cancel
        </button>
        <button type="submit" className="rounded-lg bg-(--color-accent) px-4 py-1.5 text-sm font-semibold text-black">
          Set
        </button>
      </div>
    </form>
  );
}

function Stepper({ label, value, onChange, danger, children }: { label: React.ReactNode; value: number; onChange: (by: number) => void; danger?: boolean; children?: React.ReactNode }) {
  const btn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-(--color-border) text-lg text-(--color-text) hover:bg-white/5";
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm text-(--color-text)">{label}</span>
      <button type="button" onClick={() => onChange(-1)} aria-label="Less" className={btn}>
        −
      </button>
      <span className={"w-7 text-center text-base font-semibold tabular-nums " + (danger ? "text-red-400" : "text-(--color-text)")}>{value}</span>
      <button type="button" onClick={() => onChange(1)} aria-label="More" className={btn}>
        +
      </button>
      {children}
    </div>
  );
}

function Menu(props: Props & { onClose: () => void }) {
  const { name, player, others, markers, index } = props;
  const shown = COUNTERS.filter((c) => player.counters[c.key] !== undefined);
  const hidden = COUNTERS.filter((c) => player.counters[c.key] === undefined);
  const head = "text-[11px] font-medium tracking-wide text-(--color-text-dim) uppercase";
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto overscroll-contain bg-(--color-bg-elev) p-3 text-left">
      <div className="mb-2 flex items-center">
        <span className="flex-1 text-sm font-medium text-(--color-text)">{name}</span>
        <button type="button" onClick={props.onClose} aria-label="Close" className="rounded-full p-1 text-(--color-text-dim) hover:bg-white/10">
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
                <button
                  type="button"
                  onClick={() => props.onRemoveCounter(c.key)}
                  aria-label={`Hide ${c.label}`}
                  className="rounded p-1 text-(--color-text-dim) hover:bg-white/10"
                >
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
                  className="rounded-full border border-dashed border-(--color-border) px-2.5 py-1 text-xs text-(--color-text-dim) hover:bg-white/5 hover:text-(--color-text)"
                >
                  + {c.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {MARKERS.map((m) => {
              const mine = markers[m.key] === index;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => props.onMarker(m.key)}
                  aria-pressed={mine}
                  className={
                    "rounded-full border px-2.5 py-1 text-xs " +
                    (mine ? "border-(--color-accent) bg-(--color-accent)/20 text-(--color-text)" : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5")
                  }
                >
                  {mine ? `${m.label} ✓` : m.label}
                </button>
              );
            })}
          </div>
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
                className={"h-7 w-7 rounded-full border-2 " + (player.color === c.key ? "border-white" : "border-transparent")}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
