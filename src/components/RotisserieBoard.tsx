import { useMemo, useState } from "react";
import type { Cube, CubeCard } from "../types";
import {
  claim,
  currentSeat,
  isComplete,
  seatColor,
  totalPicks,
  undoLast,
  type RotisserieState,
} from "../lib/rotisserie";
import { DraftBoardView } from "./DraftBoardView";
import { Modal } from "./Modal";

interface Props {
  cube: Cube;
  state: RotisserieState;
  onChange: (next: RotisserieState) => void;
  onNewDraft: () => void;
}

/** Local hotseat (pass-and-play) board. Wraps the shared DraftBoardView. */
export function RotisserieBoard({ cube, state, onChange, onNewDraft }: Props) {
  const cubeSize = cube.cards.length;
  const current = currentSeat(state, cubeSize);
  const complete = isComplete(state, cubeSize);

  const [confirmCard, setConfirmCard] = useState<CubeCard | null>(null);
  const [showConfirmNew, setShowConfirmNew] = useState(false);

  const picks = useMemo(
    () => state.picks.map((p) => ({ cardId: p.cardId, seatId: p.seatId })),
    [state.picks],
  );

  const doClaim = (card: CubeCard) => {
    onChange(claim(state, card.scryfall_id, cubeSize));
    setConfirmCard(null);
  };

  return (
    <>
      <DraftBoardView
        cube={cube}
        seats={state.seats}
        picks={picks}
        currentSeatId={current?.id ?? null}
        totalPicks={totalPicks(state, cubeSize)}
        canPick={!complete}
        onPickCard={setConfirmCard}
        headerRight={
          <>
            <button
              type="button"
              onClick={() => onChange(undoLast(state))}
              disabled={state.picks.length === 0}
              className="rounded border border-(--color-border) px-3 py-1.5 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => setShowConfirmNew(true)}
              className="rounded border border-(--color-border) px-3 py-1.5 hover:bg-white/5"
            >
              New draft
            </button>
          </>
        }
      />

      {/* Claim confirmation */}
      {confirmCard && current && (
        <Modal onClose={() => setConfirmCard(null)}>
          <div className="flex flex-col items-center gap-4">
            <div className="aspect-[63/88] w-56 overflow-hidden rounded-xl border-2 border-(--color-accent) bg-(--color-bg-elev)">
              {confirmCard.image_url ? (
                <img
                  src={confirmCard.image_url}
                  alt={confirmCard.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center p-3 text-center text-sm text-(--color-text-dim)">
                  {confirmCard.name}
                </span>
              )}
            </div>
            <p className="text-center text-sm text-(--color-text-dim)">
              Draft{" "}
              <span className="text-(--color-text)">{confirmCard.name}</span> for{" "}
              <span
                className="font-medium"
                style={{ color: seatColor(state.seats, current.id) }}
              >
                {current.name}
              </span>
              ?
            </p>
            <div className="flex w-full gap-2">
              <button
                type="button"
                onClick={() => setConfirmCard(null)}
                className="flex-1 rounded-lg border border-(--color-border) px-4 py-2.5 text-sm text-(--color-text-dim) hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => doClaim(confirmCard)}
                className="flex-1 rounded-lg bg-(--color-accent) px-4 py-2.5 text-sm font-semibold text-black hover:bg-(--color-accent-bright)"
              >
                Draft this card
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* New-draft confirmation */}
      {showConfirmNew && (
        <Modal onClose={() => setShowConfirmNew(false)}>
          <h2 className="mb-2 text-lg font-medium text-(--color-text)">
            Start a new draft?
          </h2>
          <p className="mb-4 text-(--color-text-dim)">
            This discards the current draft ({state.picks.length} picks) and
            returns to setup.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowConfirmNew(false)}
              className="rounded border border-(--color-border) px-4 py-2 text-sm text-(--color-text-dim) hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setShowConfirmNew(false);
                onNewDraft();
              }}
              className="rounded bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
            >
              Discard &amp; restart
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
