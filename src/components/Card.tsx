import { useState } from "react";
import type { CubeCard } from "../types";

interface Props {
  card: CubeCard;
  onClick?: () => void;
  highlighted?: boolean;
}

export function Card({ card, onClick, highlighted }: Props) {
  const [showBack, setShowBack] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const hasBack = !!card.image_url_back;
  const currentImage = showBack && hasBack ? card.image_url_back : card.image_url;

  return (
    <div
      className={
        "group relative flex flex-col items-stretch transition-transform " +
        (onClick ? "cursor-pointer hover:-translate-y-1 hover:scale-[1.02]" : "") +
        (highlighted ? " ring-4 ring-(--color-accent-bright) rounded-lg" : "")
      }
      onClick={onClick}
    >
      <div className="relative aspect-[63/88] w-full overflow-hidden rounded-lg bg-(--color-bg-elev) shadow-lg group-hover:shadow-2xl">
        {!loaded && (
          <div className="absolute inset-0 animate-pulse bg-(--color-bg-elev)" />
        )}
        {currentImage ? (
          <img
            src={currentImage}
            alt={card.name}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className={
              "h-full w-full object-cover transition-opacity " +
              (loaded ? "opacity-100" : "opacity-0")
            }
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-(--color-text-dim)">
            {card.name}
          </div>
        )}
        {hasBack && (
          <button
            type="button"
            className="absolute right-1 top-1 rounded bg-black/70 px-2 py-1 text-xs text-white hover:bg-black/90"
            onClick={(e) => {
              e.stopPropagation();
              setShowBack((s) => !s);
              setLoaded(false);
            }}
            title="Flip card"
          >
            Flip
          </button>
        )}
      </div>
    </div>
  );
}
