import type { CubeCard } from "../types";
import { Card } from "./Card";

interface Props {
  pack: CubeCard[] | null;
  warning?: string;
  onPick: (card: CubeCard) => void;
  highlightedId?: string | null;
}

export function PackDisplay({ pack, warning, onPick, highlightedId }: Props) {
  if (!pack) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed border-(--color-border) p-8 text-center text-(--color-text-dim)">
        Click <span className="mx-1 font-medium text-(--color-text)">Open Pack</span> to draw 15 cards.
      </div>
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
        {pack.map((card) => (
          <Card
            key={card.scryfall_id}
            card={card}
            onClick={() => onPick(card)}
            highlighted={card.scryfall_id === highlightedId}
          />
        ))}
      </div>
    </div>
  );
}
