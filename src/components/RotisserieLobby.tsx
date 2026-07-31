import { useMemo, useState } from "react";
import type { Cube } from "../types";
import {
  DEFAULT_CARDS_PER_SEAT,
  MAX_SEATS,
  MIN_SEATS,
  isComplete,
  totalPicks,
  type RotisserieState,
} from "../lib/rotisserie";
import { HelpTip } from "./HelpTip";

interface Props {
  cube: Cube;
  existingDraft: RotisserieState | null;
  onStart: (seatNames: string[], cardsPerSeat: number) => void;
  onResume: () => void;
  onDiscard: () => void;
}

/** Setup screen for a local hotseat rotisserie draft. */
export function RotisserieLobby({
  cube,
  existingDraft,
  onStart,
  onResume,
  onDiscard,
}: Props) {
  const cubeSize = cube.cards.length;
  const [seatCount, setSeatCount] = useState(4);
  const [names, setNames] = useState<string[]>([]);
  const [cardsPerSeat, setCardsPerSeat] = useState(DEFAULT_CARDS_PER_SEAT);

  const maxPerSeat = Math.max(1, Math.floor(cubeSize / seatCount));
  const effectivePerSeat = Math.min(cardsPerSeat, maxPerSeat);

  const seatNames = useMemo(
    () =>
      Array.from({ length: seatCount }, (_, i) => names[i] ?? ""),
    [seatCount, names],
  );

  const setName = (i: number, value: string) => {
    setNames((prev) => {
      const next = prev.slice();
      next[i] = value;
      return next;
    });
  };

  const resumeInfo = useMemo(() => {
    if (!existingDraft) return null;
    return {
      done: existingDraft.picks.length,
      total: totalPicks(existingDraft, cubeSize),
      complete: isComplete(existingDraft, cubeSize),
      seats: existingDraft.seats.length,
    };
  }, [existingDraft, cubeSize]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {resumeInfo && (
        <div className="rounded-xl border border-(--color-accent) bg-(--color-accent)/5 p-4">
          <h2 className="mb-1 text-lg font-medium text-(--color-text)">
            {resumeInfo.complete ? "Draft complete" : "Draft in progress"}
          </h2>
          <p className="mb-3 text-sm text-(--color-text-dim)">
            {resumeInfo.seats} players · {resumeInfo.done} of {resumeInfo.total}{" "}
            cards drafted.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onResume}
              className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-semibold text-black hover:bg-(--color-accent-bright)"
            >
              {resumeInfo.complete ? "View results" : "Resume draft"}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="rounded-lg border border-(--color-border) px-4 py-2 text-sm text-(--color-text-dim) hover:bg-white/5"
            >
              Discard &amp; start new
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-5">
        <h2 className="mb-1 flex items-center text-lg font-medium text-(--color-text)">
          New rotisserie draft
          <HelpTip
            label="What is rotisserie?"
            text="Rotisserie is a full-information draft with no packs. Players take turns picking one card at a time from the whole cube, in snake order (1→N, then N→1). Every pick is public and permanent. This is a local pass-and-play draft on one device."
          />
        </h2>
        <p className="mb-4 text-sm text-(--color-text-dim)">
          Drafting from <span className="text-(--color-text)">{cube.name}</span>{" "}
          ({cubeSize} cards).
        </p>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-(--color-text-dim)">
            Players
          </span>
          <input
            type="number"
            min={MIN_SEATS}
            max={MAX_SEATS}
            value={seatCount}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) {
                setSeatCount(Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.round(n))));
              }
            }}
            className="w-24 rounded border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text)"
          />
        </label>

        <div className="mb-4 space-y-2">
          {seatNames.map((name, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-right text-xs text-(--color-text-dim)">
                {i + 1}.
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(i, e.target.value)}
                placeholder={`Player ${i + 1}`}
                className="flex-1 rounded border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text)"
              />
            </div>
          ))}
        </div>

        <label className="mb-5 block">
          <span className="mb-1 block text-sm text-(--color-text-dim)">
            Cards per player{" "}
            <span className="text-(--color-text-dim)/70">(max {maxPerSeat})</span>
          </span>
          <input
            type="number"
            min={1}
            max={maxPerSeat}
            value={effectivePerSeat}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) {
                setCardsPerSeat(Math.max(1, Math.round(n)));
              }
            }}
            className="w-24 rounded border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text)"
          />
          <span className="ml-3 text-xs text-(--color-text-dim)">
            {seatCount * effectivePerSeat} of {cubeSize} cards will be drafted.
          </span>
        </label>

        <button
          type="button"
          onClick={() => onStart(seatNames, effectivePerSeat)}
          className="rounded-lg bg-(--color-accent) px-5 py-2.5 text-sm font-semibold text-black hover:bg-(--color-accent-bright)"
        >
          Start draft
        </button>
      </div>
    </div>
  );
}
