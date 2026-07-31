import { useMemo, useState } from "react";
import type { Cube, CubeCard } from "../types";
import {
  claim,
  claimedMap,
  currentSeat,
  isComplete,
  picksForSeat,
  totalPicks,
  undoLast,
  type RotisserieSeat,
  type RotisserieState,
} from "../lib/rotisserie";
import { Modal } from "./Modal";

interface Props {
  cube: Cube;
  state: RotisserieState;
  onChange: (next: RotisserieState) => void;
  onNewDraft: () => void;
}

/** Distinct badge colors per seat, cycled if there are more seats than colors. */
const SEAT_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

function seatColor(seats: RotisserieSeat[], seatId: string): string {
  const idx = seats.findIndex((s) => s.id === seatId);
  return SEAT_COLORS[((idx % SEAT_COLORS.length) + SEAT_COLORS.length) % SEAT_COLORS.length];
}

export function RotisserieBoard({ cube, state, onChange, onNewDraft }: Props) {
  const cubeSize = cube.cards.length;
  const claimed = useMemo(() => claimedMap(state), [state]);
  const seatById = useMemo(
    () => new Map(state.seats.map((s) => [s.id, s])),
    [state.seats],
  );
  const current = currentSeat(state, cubeSize);
  const complete = isComplete(state, cubeSize);

  const [search, setSearch] = useState("");
  const [hideClaimed, setHideClaimed] = useState(false);
  const [confirmCard, setConfirmCard] = useState<CubeCard | null>(null);
  const [showConfirmNew, setShowConfirmNew] = useState(false);
  // When set, the grid shows only this seat's drafted cards (async review).
  const [focusSeat, setFocusSeat] = useState<string | null>(null);

  const focusedSeat = focusSeat ? seatById.get(focusSeat) : undefined;

  const visibleCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cube.cards.filter((c) => {
      if (focusSeat) {
        if (claimed.get(c.scryfall_id) !== focusSeat) return false;
      } else if (hideClaimed && claimed.has(c.scryfall_id)) {
        return false;
      }
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cube.cards, search, hideClaimed, claimed, focusSeat]);

  const doClaim = (card: CubeCard) => {
    onChange(claim(state, card.scryfall_id, cubeSize));
    setConfirmCard(null);
  };

  return (
    <div className="space-y-5">
      {/* Turn banner */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
        style={{
          borderColor: current ? seatColor(state.seats, current.id) : undefined,
        }}
      >
        <div className="flex items-center gap-3">
          {current ? (
            <>
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: seatColor(state.seats, current.id) }}
              />
              <span className="text-lg font-medium text-(--color-text)">
                {current.name}
                <span className="text-(--color-text-dim)">’s pick</span>
              </span>
            </>
          ) : (
            <span className="text-lg font-medium text-(--color-text)">
              Draft complete 🎉
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-(--color-text-dim)">
          <span>
            {state.picks.length} / {totalPicks(state, cubeSize)} drafted
          </span>
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
        </div>
      </div>

      {/* Seat piles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {state.seats.map((seat) => {
          const picks = picksForSeat(state, seat.id);
          const isTurn = current?.id === seat.id;
          const isFocused = focusSeat === seat.id;
          const highlight = isTurn || isFocused;
          return (
            <div
              key={seat.id}
              className={
                "rounded-lg border bg-(--color-bg-elev) p-3 " +
                (highlight ? "" : "border-(--color-border)")
              }
              style={highlight ? { borderColor: seatColor(state.seats, seat.id) } : undefined}
            >
              <button
                type="button"
                onClick={() => setFocusSeat(isFocused ? null : seat.id)}
                disabled={picks.length === 0}
                title={
                  picks.length === 0
                    ? "No cards drafted yet"
                    : isFocused
                      ? "Show the whole cube"
                      : `Show only ${seat.name}'s picks`
                }
                className="mb-2 flex w-full items-center gap-2 text-left disabled:cursor-default"
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: seatColor(state.seats, seat.id) }}
                />
                <span className="truncate text-sm font-medium text-(--color-text)">
                  {seat.name}
                </span>
                <span
                  className={
                    "ml-auto shrink-0 text-xs " +
                    (isFocused
                      ? "font-medium text-(--color-accent)"
                      : "text-(--color-text-dim)")
                  }
                >
                  {isFocused ? "Viewing" : picks.length}
                </span>
              </button>
              <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-(--color-text-dim)">
                {picks.map((p) => {
                  const card = cube.cards.find((c) => c.scryfall_id === p.cardId);
                  return (
                    <li key={p.cardId} className="truncate">
                      {card?.name ?? p.cardId}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      {focusedSeat ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
          style={{ borderColor: seatColor(state.seats, focusedSeat.id) }}
        >
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: seatColor(state.seats, focusedSeat.id) }}
          />
          <span className="text-sm text-(--color-text)">
            <span className="font-medium">{focusedSeat.name}</span>
            <span className="text-(--color-text-dim)">
              {" "}
              · {visibleCards.length} of {picksForSeat(state, focusedSeat.id).length}{" "}
              picks
            </span>
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-40 rounded border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text)"
          />
          <button
            type="button"
            onClick={() => setFocusSeat(null)}
            className="ml-auto rounded border border-(--color-border) px-3 py-1.5 text-sm text-(--color-text-dim) hover:bg-white/5"
          >
            Show whole cube
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-t border-(--color-border) pt-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cards…"
            className="w-48 rounded border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text)"
          />
          <label className="flex items-center gap-2 text-sm text-(--color-text-dim)">
            <input
              type="checkbox"
              checked={hideClaimed}
              onChange={(e) => setHideClaimed(e.target.checked)}
            />
            Hide drafted cards
          </label>
          <span className="ml-auto text-xs text-(--color-text-dim)">
            {visibleCards.length} shown
          </span>
        </div>
      )}

      {/* Cube grid */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {visibleCards.map((card) => {
          const ownerId = claimed.get(card.scryfall_id);
          const owner = ownerId ? seatById.get(ownerId) : undefined;
          const isClaimed = !!ownerId;
          // Dim drafted cards only in the normal grid; hover restores them so
          // you can see what was taken. In focus mode they're the point, so
          // they stay at full opacity.
          const dimmed = isClaimed && !focusSeat;
          return (
            <button
              key={card.scryfall_id}
              type="button"
              disabled={isClaimed || complete}
              onClick={() => setConfirmCard(card)}
              title={card.name}
              className={
                "group relative aspect-[63/88] overflow-hidden rounded-md border bg-(--color-bg-elev) transition " +
                (dimmed
                  ? "border-(--color-border) opacity-40 hover:opacity-100"
                  : isClaimed || complete
                    ? "cursor-default border-(--color-border)"
                    : "border-(--color-border) hover:-translate-y-0.5 hover:border-(--color-accent)")
              }
            >
              {card.image_url ? (
                <img
                  src={card.image_url}
                  alt={card.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] text-(--color-text-dim)">
                  {card.name}
                </span>
              )}
              {owner && (
                <span
                  className="absolute inset-x-0 bottom-0 truncate px-1 py-0.5 text-center text-[10px] font-medium text-white"
                  style={{ backgroundColor: seatColor(state.seats, owner.id) }}
                >
                  {owner.name}
                </span>
              )}
            </button>
          );
        })}
      </div>

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
    </div>
  );
}
