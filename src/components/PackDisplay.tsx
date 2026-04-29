import type { CubeCard } from "../types";
import { Card } from "./Card";

interface Props {
  pack: CubeCard[] | null;
  warning?: string;
  onSpotlight: (index: number) => void;
  onOpenPack: () => void;
  emptyDisabled?: boolean;
}

export function PackDisplay({
  pack,
  warning,
  onSpotlight,
  onOpenPack,
  emptyDisabled,
}: Props) {
  if (!pack) {
    return (
      <button
        type="button"
        onClick={onOpenPack}
        disabled={emptyDisabled}
        className="flex min-h-[300px] w-full items-center justify-center rounded-xl border border-dashed border-(--color-border) p-8 text-center text-(--color-text-dim) transition-colors hover:border-(--color-accent) hover:bg-(--color-accent)/5 hover:text-(--color-text) disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-(--color-border) disabled:hover:bg-transparent disabled:hover:text-(--color-text-dim)"
      >
        Tap here to open pack and see cards.
      </button>
    );
  }

  return (
    <div className="space-y-4">
      {warning && (
        <div className="rounded-lg border border-yellow-700 bg-yellow-950/40 p-3 text-sm text-yellow-200">
          {warning}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {pack.map((card, i) => (
          <Card
            key={card.scryfall_id}
            card={card}
            onClick={() => onSpotlight(i)}
          />
        ))}
      </div>
    </div>
  );
}
