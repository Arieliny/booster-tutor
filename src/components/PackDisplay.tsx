import type { CubeCard } from "../types";
import { Card } from "./Card";

interface Props {
  pack: CubeCard[] | null;
  warning?: string;
  onSpotlight: (index: number) => void;
  /** No cards left in the cube this match. */
  emptyDisabled?: boolean;
}

export function PackDisplay({
  pack,
  warning,
  onSpotlight,
  emptyDisabled,
}: Props) {
  if (!pack) {
    return (
      <p className="rounded-xl border border-dashed border-(--color-border) px-4 py-10 text-center text-sm text-(--color-text-dim)">
        {emptyDisabled
          ? "Every card in this cube has been picked. Start a new match to put them all back."
          : "Your pack shows up here. Tap a card to look at it, then pick it."}
      </p>
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
