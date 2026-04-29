import type { GenerationMode } from "../types";

interface Props {
  mode: GenerationMode;
  onModeChange: (mode: GenerationMode) => void;
  onGenerate: () => void;
  poolEmpty: boolean;
}

const MODE_LABELS: Record<GenerationMode, string> = {
  random: "Pure Random",
  "color-balanced": "Color-Balanced",
  "power-weighted": "Power-Weighted",
};

const MODES: GenerationMode[] = ["random", "color-balanced", "power-weighted"];

export function Controls({ mode, onModeChange, onGenerate, poolEmpty }: Props) {
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
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
                "px-4 py-2 text-sm transition-colors " +
                (active
                  ? "bg-(--color-accent) text-black font-medium"
                  : "text-(--color-text-dim) hover:bg-white/5") +
                (disabled ? " cursor-not-allowed opacity-40 hover:bg-transparent" : "")
              }
            >
              {MODE_LABELS[m]}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={poolEmpty}
        className="rounded-lg bg-(--color-accent) px-6 py-3 text-base font-semibold text-black transition-colors hover:bg-(--color-accent-bright) disabled:cursor-not-allowed disabled:opacity-40"
      >
        Open Pack
      </button>
    </div>
  );
}
