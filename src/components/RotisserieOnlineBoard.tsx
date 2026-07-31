import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cube, CubeCard } from "../types";
import { seatColor, seatIndexForPick } from "../lib/rotisserie";
import {
  fetchNetState,
  netPick,
  netUndo,
  type NetDraftState,
} from "../lib/rotisserie-net";
import { DraftBoardView, type DraftPick } from "./DraftBoardView";
import { Modal } from "./Modal";

interface Props {
  code: string;
  cube: Cube;
  mySeatId: string | null;
  initialState: NetDraftState;
  onLeave: () => void;
}

const POLL_MS = 2500;

/** Parse a "cardId:seatId:pickNo" order entry (ids never contain ':'). */
function parseOrder(order: string[]): DraftPick[] {
  return order.map((entry) => {
    const first = entry.indexOf(":");
    const second = entry.indexOf(":", first + 1);
    return {
      cardId: first < 0 ? entry : entry.slice(0, first),
      seatId:
        first < 0
          ? ""
          : second > first
            ? entry.slice(first + 1, second)
            : entry.slice(first + 1),
    };
  });
}

/** Networked draft board: polls server state, enforces turn via the server. */
export function RotisserieOnlineBoard({
  code,
  cube,
  mySeatId,
  initialState,
  onLeave,
}: Props) {
  const [state, setState] = useState<NetDraftState>(initialState);
  const [confirmCard, setConfirmCard] = useState<CubeCard | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Guard against overlapping polls / stale writes.
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await fetchNetState(code);
      if (next) setState(next);
    } catch {
      // Transient network error — the next poll will retry.
    } finally {
      inFlight.current = false;
    }
  }, [code]);

  // Poll while mounted.
  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const { meta, order, cursor } = state;
  const seats = meta.seats;
  const picks = useMemo(() => parseOrder(order), [order]);

  const complete = cursor >= meta.totalPicks;
  const currentSeatId = complete
    ? null
    : (seats[seatIndexForPick(cursor, seats.length)]?.id ?? null);
  const isMyTurn = !!mySeatId && currentSeatId === mySeatId;
  const mySeat = seats.find((s) => s.id === mySeatId);
  const currentSeat = seats.find((s) => s.id === currentSeatId);

  const doPick = async (card: CubeCard) => {
    if (!mySeatId) return;
    setBusy(true);
    setNotice(null);
    const result = await netPick(code, card.scryfall_id, mySeatId);
    setConfirmCard(null);
    if (!result.ok) {
      const msg =
        result.error === "claimed"
          ? "That card was just taken by someone else."
          : result.error === "not_turn"
            ? "It's no longer your turn."
            : result.error === "complete"
              ? "The draft just finished."
              : `Couldn't pick: ${result.error}`;
      setNotice(msg);
    }
    await refresh();
    setBusy(false);
  };

  const doUndo = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await netUndo(code);
    } catch {
      setNotice("Undo failed — try again.");
    }
    await refresh();
    setBusy(false);
  };

  const statusNote = (
    <span>
      Code <span className="font-mono text-(--color-text)">{code}</span>
      {mySeat ? (
        <>
          {" · you are "}
          <span style={{ color: seatColor(seats, mySeat.id) }}>
            {mySeat.name}
          </span>
        </>
      ) : (
        " · spectating"
      )}
      {!complete &&
        (isMyTurn ? (
          <span className="text-(--color-accent)"> · your turn</span>
        ) : currentSeat ? (
          <span> · waiting for {currentSeat.name}…</span>
        ) : null)}
      {notice && <span className="text-yellow-400"> · {notice}</span>}
    </span>
  );

  return (
    <>
      <DraftBoardView
        cube={cube}
        seats={seats}
        picks={picks}
        currentSeatId={currentSeatId}
        totalPicks={meta.totalPicks}
        viewerSeatId={mySeatId}
        canPick={isMyTurn && !busy}
        onPickCard={setConfirmCard}
        statusNote={statusNote}
        headerRight={
          <>
            <button
              type="button"
              onClick={doUndo}
              disabled={busy || cursor === 0}
              className="rounded border border-(--color-border) px-3 py-1.5 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="rounded border border-(--color-border) px-3 py-1.5 hover:bg-white/5"
            >
              Leave
            </button>
          </>
        }
      />

      {confirmCard && mySeat && (
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
              <span className="text-(--color-text)">{confirmCard.name}</span>?
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
                disabled={busy}
                onClick={() => doPick(confirmCard)}
                className="flex-1 rounded-lg bg-(--color-accent) px-4 py-2.5 text-sm font-semibold text-black hover:bg-(--color-accent-bright) disabled:opacity-50"
              >
                Draft this card
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
