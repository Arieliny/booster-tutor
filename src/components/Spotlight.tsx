import { useEffect, useState } from "react";
import type { CubeCard } from "../types";

interface Props {
  pack: CubeCard[];
  initialIndex: number;
  onSelectIndex: (index: number) => void;
  onConfirm: () => void;
  onBack: () => void;
}

/**
 * Mobile-first card picking view: large highlighted card on top, scrollable
 * strip of the remaining 14 below. Tapping a strip card swaps the spotlight.
 */
export function Spotlight({
  pack,
  initialIndex,
  onSelectIndex,
  onConfirm,
  onBack,
}: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [showBack, setShowBack] = useState(false);
  const card = pack[index];

  // If the parent updates initialIndex (e.g. a fresh pack), follow it.
  useEffect(() => {
    setIndex(initialIndex);
    setShowBack(false);
  }, [initialIndex, pack]);

  if (!card) return null;
  const hasBack = !!card.image_url_back;
  const currentImage = showBack && hasBack ? card.image_url_back : card.image_url;

  const tap = (i: number) => {
    setIndex(i);
    setShowBack(false);
    onSelectIndex(i);
  };

  return (
    <div className="space-y-4">
      {/* Spotlight card */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-full max-w-[420px]">
          <div className="aspect-[63/88] w-full overflow-hidden rounded-xl border-2 border-(--color-accent) bg-(--color-bg-elev) shadow-2xl">
            {currentImage ? (
              <img
                src={currentImage}
                alt={card.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-4 text-center text-sm text-(--color-text-dim)">
                {card.name}
              </div>
            )}
          </div>
          {hasBack && (
            <button
              type="button"
              onClick={() => setShowBack((s) => !s)}
              className="absolute right-2 top-[9%] rounded bg-black/70 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/90"
            >
              Flip
            </button>
          )}
        </div>

        <div className="flex w-full max-w-[420px] gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-lg border border-(--color-border) px-4 py-3 text-sm font-medium text-(--color-text-dim) hover:bg-white/5"
          >
            Back to grid
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-(--color-accent) px-4 py-3 text-sm font-semibold text-black hover:bg-(--color-accent-bright)"
          >
            Pick this card
          </button>
        </div>
      </div>

      {/* Strip of remaining cards */}
      <div className="border-t border-(--color-border) pt-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-(--color-text-dim)">
          Other cards in this pack
        </p>
        <div className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-2">
          {pack.map((c, i) => (
            <button
              key={c.scryfall_id}
              type="button"
              onClick={() => tap(i)}
              className={
                "shrink-0 transition-transform " +
                (i === index
                  ? "scale-95 opacity-50"
                  : "hover:-translate-y-1")
              }
              aria-label={`Spotlight ${c.name}`}
            >
              <div
                className={
                  "aspect-[63/88] w-20 overflow-hidden rounded-md border bg-(--color-bg-elev) " +
                  (i === index ? "border-(--color-accent)" : "border-(--color-border)")
                }
              >
                {c.image_url ? (
                  <img
                    src={c.image_url}
                    alt={c.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] text-(--color-text-dim)">
                    {c.name}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
