import { useState } from "react";
import { MAX_PLAYERS, MIN_PLAYERS, STARTING_LIFE, colorHex, untouched, type Game } from "../lib/life";
import { TRACKERS, type LifeSettings, type TrackerKey } from "../lib/life-settings";
import { Icon, type IconName } from "./Icon";

const HEAD = "text-[11px] font-medium tracking-wide text-(--color-text-dim) uppercase";

/** The page frame both screens share: a top row, a narrow column, the fan-content line at the foot. */
function Page({ bar, children }: { bar: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto overscroll-contain bg-(--color-bg) text-(--color-text)" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto w-full max-w-sm px-4 pb-10">
        <div className="flex h-14 items-center gap-1">{bar}</div>
        <div className="space-y-7 pt-2">
          {children}
          <p className="text-center text-[11px] text-(--color-text-dim)">
            Unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved/endorsed by Wizards.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The life counter's opening screen: the game on the table, a new one
 * (players, starting life), and the way to Settings. LifeTutor opens here;
 * in Booster Tutor it's what the Life tab shows first, with a way back to
 * the rest of the app.
 */
export function LifeHome({
  title,
  game,
  settings,
  onSettings,
  onResume,
  onStart,
  onOpenSettings,
  onExit,
  welcome,
}: {
  title: string;
  game: Game;
  settings: LifeSettings;
  /** Takes an updater, so two quick taps never overwrite each other. */
  onSettings: (update: (s: LifeSettings) => LifeSettings) => void;
  onResume: () => void;
  onStart: (count: number, start: number) => void;
  onOpenSettings: () => void;
  /** Back to the app around the counter; none in LifeTutor. */
  onExit?: () => void;
  /** Shown first, above the table (a first-visit welcome). */
  welcome?: React.ReactNode;
}) {
  const inProgress = !untouched(game);
  return (
    <Page
      bar={
        <>
          {onExit && (
            <button type="button" onClick={onExit} aria-label="Back to Booster Tutor" className="-ml-2 rounded-full p-2 text-(--color-text-dim) hover:bg-white/10">
              <Icon name="back" className="h-6 w-6" />
            </button>
          )}
          <h1 className="flex-1 font-life text-2xl font-black">{title}</h1>
          <button type="button" onClick={onOpenSettings} aria-label="Settings" className="-mr-2 rounded-full p-2 text-(--color-text-dim) hover:bg-white/10">
            <Icon name="gear" className="h-6 w-6" />
          </button>
        </>
      }
    >
      {welcome}

      {/* The table is always a tap away; a game nobody has touched yet is just "back". */}
      <section className="space-y-2">
        <div className={HEAD}>On the table</div>
        <button
          type="button"
          onClick={onResume}
          className="flex w-full items-center gap-3 rounded-2xl border border-(--color-accent) bg-(--color-accent)/15 px-4 py-3.5 text-left hover:bg-(--color-accent)/25"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">{inProgress ? "Resume game" : "Back to the table"}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-(--color-text-dim)">
              {game.players.map((p, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorHex(p.color) }} />
                  <span className="font-life font-black text-(--color-text) tabular-nums">{p.life}</span>
                </span>
              ))}
            </span>
          </span>
          <Icon name="play" className="h-6 w-6 shrink-0 text-(--color-accent)" />
        </button>
      </section>

      <section className="space-y-2">
        <div className={HEAD}>New game</div>
        <NewGameForm
          game={game}
          customLife={settings.customLife}
          onCustomLife={(n) => onSettings((s) => ({ ...s, customLife: n }))}
          onStart={onStart}
        />
      </section>
    </Page>
  );
}

/**
 * Settings: which trackers this phone puts on the table, and below them
 * whatever the app adds (LifeTutor: signing in for the judge).
 */
export function LifeSettingsPage({
  settings,
  onSettings,
  onBack,
  more,
}: {
  settings: LifeSettings;
  onSettings: (update: (s: LifeSettings) => LifeSettings) => void;
  onBack: () => void;
  more?: React.ReactNode;
}) {
  return (
    <Page
      bar={
        <>
          <button type="button" onClick={onBack} aria-label="Back" className="-ml-2 rounded-full p-2 text-(--color-text-dim) hover:bg-white/10">
            <Icon name="back" className="h-6 w-6" />
          </button>
          <h1 className="flex-1 font-life text-2xl font-black">Settings</h1>
        </>
      }
    >
      <section className="space-y-2">
        <div className={HEAD}>On the table</div>
        <p className="text-sm text-(--color-text-dim)">What this phone offers during a game. Switch off what your games don't use.</p>
        <div className="divide-y divide-(--color-border) rounded-2xl border border-(--color-border) bg-(--color-bg-elev)">
          {TRACKERS.map((t) => (
            <TrackerSwitch
              key={t.key}
              icon={TRACKER_ICON[t.key]}
              label={t.label}
              hint={t.hint}
              on={settings.show[t.key]}
              onChange={(on) => onSettings((s) => ({ ...s, show: { ...s.show, [t.key]: on } }))}
            />
          ))}
        </div>
      </section>

      {more}
    </Page>
  );
}

const TRACKER_ICON: Record<TrackerKey, IconName> = {
  cmdr: "sword",
  monarch: "crown",
  dungeons: "door",
  dayNight: "sun",
  ring: "ring",
  blessing: "castle",
  emblems: "emblem",
  mana: "sparkle",
};

function TrackerSwitch({ icon, label, hint, on, onChange }: { icon: IconName; label: string; hint: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-white/5">
      <Icon name={icon} className={"h-5 w-5 shrink-0 " + (on ? "text-(--color-text)" : "text-(--color-text-dim)")} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-(--color-text)">{label}</span>
        <span className="block text-xs text-(--color-text-dim)">{hint}</span>
      </span>
      <span className={"relative h-6 w-10 shrink-0 rounded-full transition-colors " + (on ? "bg-(--color-accent)" : "bg-white/20")} aria-hidden="true">
        <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] " + (on ? "left-[1.125rem]" : "left-0.5")} />
      </span>
    </button>
  );
}

/**
 * Players and starting life, then Start. Shared by the opening screen and the
 * tray's New game box. 20 and 40 cover most games; anything else is typed in.
 */
export function NewGameForm({
  game,
  customLife,
  onCustomLife,
  onStart,
}: {
  game: Game;
  customLife: number;
  onCustomLife: (n: number) => void;
  onStart: (count: number, start: number) => void;
}) {
  const [count, setCount] = useState(game.players.length);
  // A game at an unusual total was started with a custom number: offer that again.
  const [custom, setCustom] = useState(!STARTING_LIFE.includes(game.start));
  const [start, setStart] = useState(custom ? STARTING_LIFE[0] : game.start);
  const [typed, setTyped] = useState(String(custom ? game.start : customLife));
  const chip = (on: boolean) =>
    "rounded-full border px-3.5 py-1.5 text-sm " +
    (on ? "border-(--color-accent) bg-(--color-accent)/15 text-(--color-text)" : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5");
  const typedLife = Math.min(999, Math.max(1, Math.round(Number(typed) || 0)));
  const chosen = custom ? typedLife : start;
  const begin = () => {
    if (custom) onCustomLife(typedLife);
    onStart(count, chosen);
  };
  return (
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
        <div className="flex flex-wrap items-center gap-1.5">
          {STARTING_LIFE.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setCustom(false);
                setStart(s);
              }}
              aria-pressed={!custom && start === s}
              className={chip(!custom && start === s)}
            >
              {s}
            </button>
          ))}
          <button type="button" onClick={() => setCustom(true)} aria-pressed={custom} className={chip(custom)}>
            Custom
          </button>
          {custom && (
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onBlur={() => setTyped(String(typedLife))}
              aria-label="Custom starting life"
              autoFocus
              className="w-20 rounded-full border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-center text-sm text-(--color-text) tabular-nums"
            />
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={begin}
        className="w-full rounded-lg bg-(--color-accent) py-3 text-base font-semibold text-black hover:bg-(--color-accent-bright)"
      >
        {untouched(game) ? "Start" : "End this game and start"}
      </button>
      <p className="text-xs text-(--color-text-dim)">Seats keep their colors. Life, counters, dungeons, the Ring, emblems, day/night and history start fresh.</p>
    </div>
  );
}
