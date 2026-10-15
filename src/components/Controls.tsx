import { useState } from "react";
import type { GenerationMode } from "../types";
import { MAX_PACK_SIZE, MIN_PACK_SIZE } from "../lib/pack-generator";
import { HelpTip } from "./HelpTip";

interface Props {
  mode: GenerationMode;
  onModeChange: (mode: GenerationMode) => void;
  packSize: number;
  onPackSizeChange: (n: number) => void;
  onOpenSameMatch: () => void;
  onOpenNewMatch: () => void;
  poolEmpty: boolean;
  hasPickedCards: boolean;
}

const MODE_LABELS: Record<GenerationMode, string> = {
  random: "Random",
  "color-balanced": "Color-balanced",
};

const MODES: GenerationMode[] = ["random", "color-balanced"];

const NEW_MATCH_TOOLTIP =
  "Booster Tutor only removes cards from your cube for the rest of the current match. Start a new match when you play a different opponent (or a new round) and want the full cube available again.";

/** Play: one big "Open a pack", with the pack settings and "new match" tucked underneath. */
export function Controls({
  mode,
  onModeChange,
  packSize,
  onPackSizeChange,
  onOpenSameMatch,
  onOpenNewMatch,
  poolEmpty,
  hasPickedCards,
}: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const clampSize = (n: number) => Math.min(MAX_PACK_SIZE, Math.max(MIN_PACK_SIZE, Math.round(n) || MIN_PACK_SIZE));
  const stepClass =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-(--color-border) text-lg text-(--color-text) hover:bg-white/5 disabled:opacity-30";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onOpenSameMatch}
        disabled={poolEmpty}
        className="w-full rounded-xl bg-(--color-accent) px-4 py-4 text-base font-semibold text-black transition-colors hover:bg-(--color-accent-bright) disabled:cursor-not-allowed disabled:opacity-40"
      >
        {poolEmpty ? "No cards left this match" : "Open a pack"}
      </button>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          aria-expanded={showSettings}
          className="inline-flex items-center gap-1.5 rounded-full border border-(--color-border) px-3 py-1.5 text-sm text-(--color-text-dim) hover:bg-white/5 hover:text-(--color-text)"
        >
          {MODE_LABELS[mode]} · {packSize} cards
          <span aria-hidden="true" className={"text-xs transition-transform " + (showSettings ? "rotate-180" : "")}>
            ▾
          </span>
        </button>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenNewMatch}
            className={
              "rounded px-2 py-1.5 text-sm hover:underline " + (hasPickedCards ? "text-(--color-accent)" : "text-(--color-text-dim)")
            }
          >
            Start a new match
          </button>
          <HelpTip text={NEW_MATCH_TOOLTIP} label="What is a new match?" />
        </span>
      </div>

      {showSettings && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-3">
          <div
            role="radiogroup"
            aria-label="How packs are made"
            className="inline-flex overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg)"
          >
            {MODES.map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onModeChange(m)}
                  className={
                    "px-3 py-2 text-sm transition-colors " +
                    (active ? "bg-(--color-accent) font-medium text-black" : "text-(--color-text-dim) hover:bg-white/5")
                  }
                >
                  {MODE_LABELS[m]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-(--color-text-dim)">Cards a pack</span>
            <button
              type="button"
              onClick={() => onPackSizeChange(clampSize(packSize - 1))}
              disabled={packSize <= MIN_PACK_SIZE}
              aria-label="Fewer cards"
              className={stepClass}
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_PACK_SIZE}
              max={MAX_PACK_SIZE}
              value={packSize}
              onChange={(e) => onPackSizeChange(clampSize(Number(e.target.value)))}
              aria-label="Cards a pack"
              className="w-14 rounded-lg border border-(--color-border) bg-(--color-bg) px-2 py-1.5 text-center text-sm text-(--color-text)"
            />
            <button
              type="button"
              onClick={() => onPackSizeChange(clampSize(packSize + 1))}
              disabled={packSize >= MAX_PACK_SIZE}
              aria-label="More cards"
              className={stepClass}
            >
              +
            </button>
          </div>

          <p className="w-full text-xs text-(--color-text-dim)">
            {mode === "random"
              ? "Any cards from what's left in the cube."
              : "Spread across the colors: at 15 cards, 2 of each color, 3 multicolor and 2 colorless."}
          </p>
        </div>
      )}
    </div>
  );
}
