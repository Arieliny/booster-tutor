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
  random: "Pure Random",
  "color-balanced": "Color-Balanced",
  "power-weighted": "Power-Weighted",
};

const MODES: GenerationMode[] = ["random", "color-balanced", "power-weighted"];

const NEW_MATCH_TOOLTIP =
  "Booster Tutor only removes cards from your cube for the rest of the current match. Use \"new match\" when you start a fresh game against a different opponent (or a new round) and want the full cube available again.";

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
  const clampSize = (n: number) =>
    Math.min(MAX_PACK_SIZE, Math.max(MIN_PACK_SIZE, Math.round(n) || MIN_PACK_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="radiogroup"
          aria-label="Generation mode"
          className="inline-flex overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg-elev)"
        >
          {MODES.map((m) => {
            const disabled = m === "power-weighted";
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onModeChange(m)}
                title={
                  disabled
                    ? "Coming soon - requires power tier tagging"
                    : MODE_LABELS[m]
                }
                className={
                  "px-3 py-2 text-sm transition-colors " +
                  (active
                    ? "bg-(--color-accent) text-black font-medium"
                    : "text-(--color-text-dim) hover:bg-white/5") +
                  (disabled
                    ? " cursor-not-allowed opacity-40 hover:bg-transparent"
                    : "")
                }
              >
                {MODE_LABELS[m]}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          <label
            htmlFor="pack-size"
            className="text-xs uppercase tracking-wide text-(--color-text-dim)"
          >
            Pack size
          </label>
          <input
            id="pack-size"
            type="number"
            min={MIN_PACK_SIZE}
            max={MAX_PACK_SIZE}
            value={packSize}
            onChange={(e) => onPackSizeChange(clampSize(Number(e.target.value)))}
            className="w-16 rounded border border-(--color-border) bg-(--color-bg) px-2 py-1.5 text-center text-sm text-(--color-text)"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenSameMatch}
          disabled={poolEmpty}
          className="flex-1 rounded-lg bg-(--color-accent) px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-(--color-accent-bright) disabled:cursor-not-allowed disabled:opacity-40 sm:flex-initial"
        >
          Open pack — same match
        </button>
        <div className="flex flex-1 items-center gap-1 sm:flex-initial">
          <button
            type="button"
            onClick={onOpenNewMatch}
            disabled={false /* always allowed */}
            className={
              "flex-1 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors sm:flex-initial " +
              (hasPickedCards
                ? "border-(--color-accent) text-(--color-accent) hover:bg-(--color-accent)/10"
                : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5")
            }
          >
            Open pack — new match
          </button>
          <HelpTip text={NEW_MATCH_TOOLTIP} label="What is a new match?" />
        </div>
      </div>
    </div>
  );
}
