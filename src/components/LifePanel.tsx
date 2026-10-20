import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { dungeonOf } from "../lib/dungeons";
import {
  COLORS,
  COUNTERS,
  colorHex,
  colorInk,
  counterIcon,
  maxTracked,
  trackedCount,
  tracksCmdr,
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
/** A corner of the seat, from its player's side of the table. */
export type Corner = "tl" | "tr" | "bl";

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
  /** Where the dungeons door goes while the tray is open: a corner away from the tray bar (never the ⋯ corner). */
  doorCorner: Corner;
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
  /** Show or hide this card's commander damage strip (every opponent). */
  onCmdrTracking: (on: boolean) => void;
  onDungeon: () => void;
  /** Tap the crown: pass the monarch (1v1: to the other player; more: pick who). */
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
  const { name, player, w, h, highlight, markers, index, others, picking, trayOpen, doorCorner } = props;
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
  // Commander damage, switched on in the menu: one strip with every opponent (their color on the sword).
  const cmdrOn = tracksCmdr(player);
  // The total is as big as the seat allows, after room for the crown, counters and commander damage.
  const marked = monarch || initiative;
  // Three or more counters sit two to a row so the total stays big.
  const tracked = shown.length;
  const counterRows = tracked > 2 ? Math.ceil(tracked / 2) : tracked;
  // The strip keeps clear of the ⋯ in the bottom corner (it can be the lowest thing on a small card).
  const under = counterRows * 38 + (cmdrOn ? 32 + 28 : 0);
  // Two digits get half the seat's width; three (or a minus sign) shrink so they stay clear of - and +.
  const chars = String(player.life).length;
  const fit = (above: number, below: number, widest: number, slack = 50) =>
    Math.max(40, Math.min(300, (h - above - below - slack) * 0.9, widest));
  const tall = Math.max(28, Math.min(64, h * 0.13));
  // On a crowded card the crown and door shrink to badges either side of the total (the door shows the
  // room, so the room chip goes), rather than squeezing the total under big markers. The change in life
  // shows in place of the − or + there instead of keeping a row free under the total.
  const roomy = w * (chars >= 3 ? 0.33 : 0.5);
  const compact = marked && fit(tall, under + (player.dungeon ? 26 : 0), roomy) < 90;
  const roomChip = !!player.dungeon && !(compact && initiative);
  const below = under + (roomChip ? 26 : 0);
  const crown = marked && !compact ? tall : 0;
  const big = compact ? fit(0, below, (w - 2 * BADGE - 2 * SIGN - 32) / (0.6 * chars), 0) : fit(crown, below, roomy);
  const change = delta !== 0 && (delta > 0 ? `+${delta}` : `−${-delta}`);
  const half = "h-full flex-1 select-none touch-manipulation active:bg-black/10";
  const sign = Math.max(22, Math.min(36, big * 0.4));

  return (
    <div className="relative h-full w-full">
      {/* Only buttons take taps here. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {/* The total and everything above it. */}
        <div className="relative flex flex-col items-center">
          {/* The tap halves (their − and + are drawn beside the total). They span the seat's width from its
              top edge down to the bottom of the total - or all the way down when nothing sits below it -
              so a near miss on a counter or commander damage never changes life. The seat clips what overhangs. */}
          <div
            className="pointer-events-auto absolute flex"
            style={{ left: "50%", width: w, transform: "translateX(-50%)", top: -h, bottom: tracked > 0 || cmdrOn ? 0 : -h }}
          >
            <button type="button" aria-label={`${name}: lose 1 life (hold for 10)`} className={half} {...minus} />
            <button type="button" aria-label={`${name}: gain 1 life (hold for 10)`} className={half} {...plus} />
          </div>
          {highlight === "first" && <div className="relative mb-1 text-xs font-bold tracking-wide uppercase">Goes first</div>}
          {crown > 0 && (
            <div className="relative mb-1 flex items-end gap-5">
              {monarch && <Marker icon="crown" label="Monarch" size={crown} onClick={props.onPassMonarch} title="Pass the monarch" />}
              {initiative && <Marker icon="door" label="Initiative" size={crown} onClick={props.onDungeon} title="Open the dungeons" />}
            </div>
          )}
          {/* − and + right beside the total, so they stay close when counters shrink it. */}
          <div className="relative flex items-center" style={{ gap: Math.max(8, big * 0.1) }}>
            {/* Each badge keeps its slot even when alone, so the total stays centred. */}
            {compact && <div style={{ width: BADGE }}>{monarch && <Badge icon="crown" label="Monarch" onClick={props.onPassMonarch} title="Pass the monarch" />}</div>}
            <Sign glyph="−" size={sign} compact={compact} change={compact && delta < 0 ? change : false} />
            {/* At 0 or below it's dimmed, not crossed out: some cards (Platinum Angel...) keep a player in. */}
            <div
              className={"font-life leading-[0.95] font-black tabular-nums " + (player.life <= 0 ? "opacity-60" : "")}
              style={{ fontSize: big }}
              aria-live="polite"
              data-life
            >
              {player.life}
            </div>
            <Sign glyph="+" size={sign} compact={compact} change={compact && delta > 0 ? change : false} />
            {compact && (
              <div style={{ width: BADGE }}>
                {initiative && (
                  <Badge icon="door" label={player.dungeon?.room ?? "Initiative"} onClick={props.onDungeon} title="Open the dungeons" />
                )}
              </div>
            )}
          </div>
        </div>
        {!compact && <div className="relative h-6 font-life text-lg font-black tabular-nums">{change}</div>}

        {tracked > 0 && (
          <div className={"relative " + (tracked > 2 ? "grid grid-cols-2 gap-x-3 gap-y-1" : "flex flex-col items-center gap-1")}>
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
          </div>
        )}

        {cmdrOn && <CmdrStrip others={others} values={player.cmdr} who={name} onCmdr={props.onCmdr} />}

        {player.dungeon && roomChip && (
          <div className="relative mt-1 flex max-w-[80%] flex-wrap justify-center gap-1">
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

      {/* The door takes this corner while the tray is open. */}
      {player.completed && !(trayOpen && doorCorner === "bl") ? (
        <div className="absolute bottom-2.5 left-3 text-[11px] font-medium opacity-75">
          {player.completed} dungeon{player.completed === 1 ? "" : "s"} done
        </div>
      ) : null}

      {/* With the tray open, each seat gets a door to the dungeon tracker, facing them: in a corner,
          clear of the crown and the total in the middle, and of the tray bar (see doorCorner). */}
      {trayOpen && !picking && (
        <button
          type="button"
          onClick={props.onDungeon}
          aria-label={`${name}: dungeons and the initiative`}
          className={
            "absolute flex flex-col items-center rounded-2xl bg-black/35 px-2.5 py-1.5 text-white " +
            (doorCorner === "tr" ? "top-1.5 right-1.5" : doorCorner === "bl" ? "bottom-1.5 left-1.5" : "top-1.5 left-1.5")
          }
        >
          <Icon name="door" className="h-6 w-6" />
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

/** The − or + beside the total; on a crowded card the change in life takes its place for a moment. */
function Sign({ glyph, size, compact, change }: { glyph: string; size: number; compact: boolean; change: string | false }) {
  return (
    <span aria-hidden="true" className="relative text-center" style={{ fontSize: size, minWidth: compact ? SIGN : undefined }}>
      <span className={change ? "invisible" : "opacity-45"}>{glyph}</span>
      {change && (
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-life text-base font-black whitespace-nowrap tabular-nums">
          {change}
        </span>
      )}
    </span>
  );
}

/** How wide a compact marker's slot is beside the total, and the − / + slots that hold the change there. */
const BADGE = 60;
const SIGN = 28;

/** A marker shrunk to sit beside the total on a crowded card; the door's label is the current room. */
function Badge({ icon, label, onClick, title }: { icon: "crown" | "door"; label: string; onClick?: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      title={title}
      className="pointer-events-auto flex w-full flex-col items-center rounded-xl bg-black/40 px-1 py-0.5 leading-none"
      style={{ color: MARKER_TINT[icon] }}
    >
      <Icon name={icon} className="h-5 w-5" />
      <span className="mt-0.5 line-clamp-2 text-center text-[9px] leading-tight font-bold tracking-wide break-words uppercase">{label}</span>
    </button>
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
  const btn = "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/25 active:bg-black/40";
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onDown} aria-label={`${who}: ${label} down`} className={btn}>
        <Icon name="minus" className="h-4 w-4" />
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
        <Icon name="plus" className="h-4 w-4" />
      </button>
    </div>
  );
}

/** How long a sword stays open for −/+ after the last tap. */
const CMDR_OPEN_MS = 3000;

/**
 * Commander damage from every opponent in one line: a sword in their color and
 * the damage (red at 21). Tap a sword to change it - it opens into − n + on its
 * own (so it fits the smallest seats) and closes a few seconds after the last
 * tap, or when its sword is tapped again. Opening first means a stray tap never
 * changes anyone's damage.
 */
function CmdrStrip({
  others,
  values,
  who,
  onCmdr,
}: {
  others: { index: number; name: string; color: ColorKey }[];
  values: Partial<Record<number, number>>;
  who: string;
  onCmdr: (from: number, by: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const keepOpen = (from: number | null) => {
    window.clearTimeout(timer.current);
    setOpen(from);
    if (from !== null) timer.current = window.setTimeout(() => setOpen(null), CMDR_OPEN_MS);
  };
  const sword = (v: number) => (
    <>
      <Icon name="sword" className="h-3.5 w-3.5" />
      <span className="font-life text-[15px] font-black text-white tabular-nums" style={v >= 21 ? { color: "#fca5a5" } : undefined}>
        {v}
      </span>
    </>
  );
  const step = "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/25 active:bg-black/40";

  const o = open === null ? undefined : others.find((x) => x.index === open);
  if (o) {
    const v = values[o.index] ?? 0;
    return (
      <div className="relative mt-1 mb-7 flex items-center gap-2">
        <button type="button" onClick={() => (onCmdr(o.index, -1), keepOpen(o.index))} aria-label={`${who}: commander damage from ${o.name} down`} className={step}>
          <Icon name="minus" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => keepOpen(null)}
          aria-label={`Commander damage from ${o.name}: ${v}. Done`}
          className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1"
          style={{ color: colorHex(o.color) }}
        >
          {sword(v)}
        </button>
        <button type="button" onClick={() => (onCmdr(o.index, 1), keepOpen(o.index))} aria-label={`${who}: commander damage from ${o.name} up`} className={step}>
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative mt-1 mb-7 flex max-w-full flex-wrap justify-center gap-1">
      {others.map((x) => {
        const v = values[x.index] ?? 0;
        return (
          <button
            key={x.index}
            type="button"
            onClick={() => keepOpen(x.index)}
            aria-label={`Commander damage from ${x.name}: ${v}. Tap to change`}
            className={"pointer-events-auto flex items-center gap-0.5 rounded-full px-1.5 py-1 " + (v >= 21 ? "bg-black" : "bg-black/35")}
            style={{ color: colorHex(x.color) }}
          >
            {sword(v)}
          </button>
        );
      })}
    </div>
  );
}

function Menu(props: Props & { onClose: () => void }) {
  const { name, player, others } = props;
  const head = "text-[11px] font-medium tracking-wide text-white/60 uppercase";
  // A card shows at most `most` rows under the total (fewer at a bigger table); when it's full, only removing is offered.
  const most = maxTracked(others.length + 1);
  const full = trackedCount(player) >= most;
  const off = "border-white/20 text-white/75 hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent";
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
        {full && (
          <p className="rounded-lg bg-white/10 px-3 py-2 text-xs text-white/80">
            Your card shows {most}, the most it can with {others.length + 1} players. Remove one to add another.
          </p>
        )}
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
                    disabled={!on && full}
                    className={
                      "flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm " +
                      (on ? "border-white bg-white/15" : off)
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
                  disabled={!on && full}
                  className={
                    "flex h-11 w-11 items-center justify-center rounded-lg border " +
                    (on ? "border-white bg-white/15" : "border-white/20 opacity-60 hover:bg-white/10 hover:opacity-100 disabled:opacity-25 disabled:hover:bg-transparent")
                  }
                >
                  <Pip sym={c.pip!} size={26} />
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-1.5">
          <div className={head}>Commander damage</div>
          {/* One strip with every opponent; it doesn't use up counter space. */}
          <button
            type="button"
            onClick={() => props.onCmdrTracking(!tracksCmdr(player))}
            aria-pressed={tracksCmdr(player)}
            className={
              "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm " +
              (tracksCmdr(player) ? "border-white bg-white/15" : "border-white/20 text-white/75 hover:bg-white/10")
            }
          >
            <Icon name="sword" className="h-5 w-5 shrink-0" />
            <span className="flex shrink-0 -space-x-1">
              {others.map((o) => (
                <span key={o.index} className="h-3 w-3 rounded-full ring-1 ring-[#14161c]" style={{ background: colorHex(o.color) }} />
              ))}
            </span>
            <span className="min-w-0 flex-1 truncate">From each opponent</span>
            {tracksCmdr(player) && <Icon name="check" className="h-4 w-4 shrink-0" />}
          </button>
        </section>

        <section className="space-y-1.5">
          <div className={head}>Color</div>
          <div className="flex flex-wrap gap-2">
            {/* Two players can't share a color: one someone else has is dimmed, with their seat on it. */}
            {COLORS.map((c) => {
              const owner = others.find((o) => o.color === c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => props.onColor(c.key)}
                  disabled={!!owner}
                  aria-label={owner ? `${c.label} (P${owner.index + 1} has it)` : c.label}
                  aria-pressed={player.color === c.key}
                  className={
                    "relative flex h-9 w-9 items-center justify-center rounded-full border-2 " +
                    (player.color === c.key ? "border-white" : "border-transparent")
                  }
                >
                  <span className={"absolute inset-0 rounded-full " + (owner ? "opacity-30" : "")} style={{ background: c.hex }} />
                  {owner && <span className="relative text-[11px] font-bold text-white">P{owner.index + 1}</span>}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
