import { useMemo, useState, type ReactNode } from "react";
import type { Cube, CubeCard } from "../types";
import { seatColor, type RotisserieSeat } from "../lib/rotisserie";

export interface DraftPick {
  cardId: string;
  seatId: string;
}

interface Props {
  cube: Cube;
  seats: RotisserieSeat[];
  /** Picks in draft order. */
  picks: DraftPick[];
  /** Whose turn it is, or null when the draft is complete. */
  currentSeatId: string | null;
  totalPicks: number;
  /** The viewer's own seat (online), for "Your pick" phrasing. Omit for hotseat. */
  viewerSeatId?: string | null;
  /** Whether clicking an unclaimed card should fire onPickCard. */
  canPick: boolean;
  onPickCard: (card: CubeCard) => void;
  /** Right-hand header controls (undo / new draft / leave). */
  headerRight?: ReactNode;
  /** Optional note under the turn banner (online status / errors). */
  statusNote?: ReactNode;
}

/**
 * Presentational draft board shared by the local hotseat board and the online
 * board: turn banner, per-seat piles (with click-to-focus review), search /
 * hide-drafted filters, and the full-cube grid with claimed cards greyed +
 * owner badge. It owns only view state (search, hide, focus); all draft state
 * and the pick/confirm flow live in the parent.
 */
export function DraftBoardView({
  cube,
  seats,
  picks,
  currentSeatId,
  totalPicks,
  viewerSeatId,
  canPick,
  onPickCard,
  headerRight,
  statusNote,
}: Props) {
  const cardById = useMemo(
    () => new Map(cube.cards.map((c) => [c.scryfall_id, c])),
    [cube.cards],
  );
  const seatById = useMemo(
    () => new Map(seats.map((s) => [s.id, s])),
    [seats],
  );
  const claimed = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of picks) m.set(p.cardId, p.seatId);
    return m;
  }, [picks]);
  const picksBySeat = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of seats) m.set(s.id, []);
    for (const p of picks) m.get(p.seatId)?.push(p.cardId);
    return m;
  }, [picks, seats]);

  const current = currentSeatId ? seatById.get(currentSeatId) : undefined;

  const [search, setSearch] = useState("");
  const [hideClaimed, setHideClaimed] = useState(false);
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

  return (
    <div className="space-y-5">
      {/* Turn banner */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
        style={{ borderColor: current ? seatColor(seats, current.id) : undefined }}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            {current ? (
              <>
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: seatColor(seats, current.id) }}
                />
                <span className="text-lg font-medium text-(--color-text)">
                  {current.id === viewerSeatId ? (
                    "Your pick"
                  ) : (
                    <>
                      {current.name}
                      <span className="text-(--color-text-dim)">’s pick</span>
                    </>
                  )}
                </span>
              </>
            ) : (
              <span className="text-lg font-medium text-(--color-text)">
                Draft complete 🎉
              </span>
            )}
          </div>
          {statusNote && (
            <div className="text-xs text-(--color-text-dim)">{statusNote}</div>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-(--color-text-dim)">
          <span>
            {picks.length} / {totalPicks} drafted
          </span>
          {headerRight}
        </div>
      </div>

      {/* Seat piles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {seats.map((seat) => {
          const seatPicks = picksBySeat.get(seat.id) ?? [];
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
              style={highlight ? { borderColor: seatColor(seats, seat.id) } : undefined}
            >
              <button
                type="button"
                onClick={() => setFocusSeat(isFocused ? null : seat.id)}
                disabled={seatPicks.length === 0}
                title={
                  seatPicks.length === 0
                    ? "No cards drafted yet"
                    : isFocused
                      ? "Show the whole cube"
                      : `Show only ${seat.name}'s picks`
                }
                className="mb-2 flex w-full items-center gap-2 text-left disabled:cursor-default"
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: seatColor(seats, seat.id) }}
                />
                <span className="truncate text-sm font-medium text-(--color-text)">
                  {seat.name}
                  {seat.id === viewerSeatId && (
                    <span className="text-(--color-text-dim)"> (you)</span>
                  )}
                </span>
                <span
                  className={
                    "ml-auto shrink-0 text-xs " +
                    (isFocused
                      ? "font-medium text-(--color-accent)"
                      : "text-(--color-text-dim)")
                  }
                >
                  {isFocused ? "Viewing" : seatPicks.length}
                </span>
              </button>
              <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-(--color-text-dim)">
                {seatPicks.map((cardId) => (
                  <li key={cardId} className="truncate">
                    {cardById.get(cardId)?.name ?? cardId}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      {focusedSeat ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
          style={{ borderColor: seatColor(seats, focusedSeat.id) }}
        >
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: seatColor(seats, focusedSeat.id) }}
          />
          <span className="text-sm text-(--color-text)">
            <span className="font-medium">{focusedSeat.name}</span>
            <span className="text-(--color-text-dim)">
              {" "}
              · {visibleCards.length} of{" "}
              {(picksBySeat.get(focusedSeat.id) ?? []).length} picks
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
          const clickable = !isClaimed && canPick;
          // Dim drafted cards only in the normal grid; hover restores them so
          // you can see what was taken. In focus mode they're the point.
          const dimmed = isClaimed && !focusSeat;
          return (
            <button
              key={card.scryfall_id}
              type="button"
              disabled={!clickable}
              onClick={() => onPickCard(card)}
              title={card.name}
              className={
                "group relative aspect-[63/88] overflow-hidden rounded-md border bg-(--color-bg-elev) transition " +
                (dimmed
                  ? "border-(--color-border) opacity-40 hover:opacity-100"
                  : clickable
                    ? "border-(--color-border) hover:-translate-y-0.5 hover:border-(--color-accent)"
                    : "cursor-default border-(--color-border)")
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
                  style={{ backgroundColor: seatColor(seats, owner.id) }}
                >
                  {owner.name}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
