import { useEffect, useMemo, useState } from "react";
import type { Cube } from "../types";
import {
  DEFAULT_CARDS_PER_SEAT,
  MAX_SEATS,
  MIN_SEATS,
  seatColor,
  type RotisserieSeat,
} from "../lib/rotisserie";
import {
  clearActiveDraft,
  createNetDraft,
  fetchNetCube,
  fetchNetState,
  generateDraftCode,
  getActiveDraft,
  getMySeat,
  normalizeDraftCode,
  setActiveDraft,
  setMySeat,
  type NetDraftState,
} from "../lib/rotisserie-net";
import { HelpTip } from "./HelpTip";
import { RotisserieOnlineBoard } from "./RotisserieOnlineBoard";

interface Props {
  cube: Cube;
}

type View =
  | { kind: "loading" }
  | { kind: "menu" }
  | { kind: "seatpick"; code: string; state: NetDraftState }
  | {
      kind: "playing";
      code: string;
      cube: Cube;
      state: NetDraftState;
      mySeatId: string | null;
    };

function makeSeats(names: string[]): RotisserieSeat[] {
  return names.map((raw, i) => ({
    id: `seat-${i}`,
    name: raw.trim() || `Player ${i + 1}`,
  }));
}

export function RotisserieOnline({ cube }: Props) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);

  // Resume an active draft on mount, if any.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const active = getActiveDraft();
      if (!active) {
        if (!cancelled) setView({ kind: "menu" });
        return;
      }
      try {
        const state = await fetchNetState(active.code);
        if (!state) {
          clearActiveDraft();
          if (!cancelled) setView({ kind: "menu" });
          return;
        }
        const cubeBody = await fetchNetCube(active.code);
        if (!cancelled) {
          setView({
            kind: "playing",
            code: active.code,
            cube: cubeBody,
            state,
            mySeatId: active.seatId,
          });
        }
      } catch {
        if (!cancelled) setView({ kind: "menu" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enterSeatPick = async (code: string, state: NetDraftState) => {
    const existing = getMySeat(code);
    if (existing) {
      // Already chose a seat here before — go straight in.
      await enterPlaying(code, state, existing);
      return;
    }
    setView({ kind: "seatpick", code, state });
  };

  const enterPlaying = async (
    code: string,
    state: NetDraftState,
    seatId: string | null,
  ) => {
    setActiveDraft(code);
    if (seatId) setMySeat(code, seatId);
    try {
      const cubeBody = await fetchNetCube(code);
      setView({ kind: "playing", code, cube: cubeBody, state, mySeatId: seatId });
    } catch {
      setError("Couldn't load the draft's cube. Try again.");
      setView({ kind: "menu" });
    }
  };

  const leave = () => {
    clearActiveDraft();
    setError(null);
    setView({ kind: "menu" });
  };

  if (view.kind === "loading") {
    return <p className="text-(--color-text-dim)">Loading…</p>;
  }

  if (view.kind === "playing") {
    return (
      <RotisserieOnlineBoard
        code={view.code}
        cube={view.cube}
        mySeatId={view.mySeatId}
        initialState={view.state}
        onLeave={leave}
      />
    );
  }

  if (view.kind === "seatpick") {
    return (
      <SeatPicker
        state={view.state}
        onPick={(seatId) => enterPlaying(view.code, view.state, seatId)}
        onSpectate={() => enterPlaying(view.code, view.state, null)}
        onBack={leave}
      />
    );
  }

  return (
    <OnlineMenu
      cube={cube}
      error={error}
      setError={setError}
      onCreated={enterSeatPick}
      onJoined={enterSeatPick}
    />
  );
}

// ---------------------------------------------------------------------------

function SeatPicker({
  state,
  onPick,
  onSpectate,
  onBack,
}: {
  state: NetDraftState;
  onPick: (seatId: string) => void;
  onSpectate: () => void;
  onBack: () => void;
}) {
  const { meta } = state;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-5">
        <h2 className="mb-1 text-lg font-medium text-(--color-text)">
          Which player are you?
        </h2>
        <p className="mb-4 text-sm text-(--color-text-dim)">
          Drafting {meta.cubeName} · {meta.seats.length} players ·{" "}
          {meta.cardsPerSeat} cards each.
        </p>
        <div className="space-y-2">
          {meta.seats.map((seat) => (
            <button
              key={seat.id}
              type="button"
              onClick={() => onPick(seat.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-(--color-border) px-4 py-3 text-left hover:border-(--color-accent) hover:bg-white/5"
            >
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: seatColor(meta.seats, seat.id) }}
              />
              <span className="text-(--color-text)">{seat.name}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-(--color-text-dim) hover:text-(--color-text)"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={onSpectate}
            className="text-sm text-(--color-text-dim) hover:text-(--color-text)"
          >
            Just spectate
          </button>
        </div>
      </div>
      <p className="text-center text-xs text-(--color-text-dim)">
        Pick the seat that's yours — only that player can draft on their turn.
        Anyone playing on the same device before shares its seat.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function OnlineMenu({
  cube,
  error,
  setError,
  onCreated,
  onJoined,
}: {
  cube: Cube;
  error: string | null;
  setError: (m: string | null) => void;
  onCreated: (code: string, state: NetDraftState) => void;
  onJoined: (code: string, state: NetDraftState) => void;
}) {
  const cubeSize = cube.cards.length;
  const [seatCount, setSeatCount] = useState(4);
  const [names, setNames] = useState<string[]>([]);
  const [cardsPerSeat, setCardsPerSeat] = useState(DEFAULT_CARDS_PER_SEAT);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);

  const maxPerSeat = Math.max(1, Math.floor(cubeSize / seatCount));
  const effectivePerSeat = Math.min(cardsPerSeat, maxPerSeat);
  const seatNames = useMemo(
    () => Array.from({ length: seatCount }, (_, i) => names[i] ?? ""),
    [seatCount, names],
  );

  const setName = (i: number, value: string) =>
    setNames((prev) => {
      const next = prev.slice();
      next[i] = value;
      return next;
    });

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    const code = generateDraftCode();
    const seats = makeSeats(seatNames);
    try {
      await createNetDraft(code, cube, seats, effectivePerSeat);
      const state = await fetchNetState(code);
      if (!state) throw new Error("Draft vanished right after creation.");
      onCreated(code, state);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const code = normalizeDraftCode(joinCode);
    if (!code) {
      setError("That doesn't look like a valid code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const state = await fetchNetState(code);
      if (!state) {
        setError("No draft found with that code.");
        return;
      }
      onJoined(code, state);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {error && (
        <div className="rounded-lg border border-yellow-700 bg-yellow-950/40 p-3 text-sm text-yellow-200">
          {error}
        </div>
      )}

      {/* Join */}
      <div className="rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-5">
        <h2 className="mb-1 text-lg font-medium text-(--color-text)">
          Join a draft
        </h2>
        <p className="mb-3 text-sm text-(--color-text-dim)">
          Enter the code someone shared with you.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="draft code"
            className="w-48 rounded border border-(--color-border) bg-(--color-bg) px-3 py-2 font-mono text-sm text-(--color-text)"
          />
          <button
            type="button"
            onClick={handleJoin}
            disabled={busy}
            className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-semibold text-black hover:bg-(--color-accent-bright) disabled:opacity-50"
          >
            Join
          </button>
        </div>
      </div>

      {/* Create */}
      <div className="rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-5">
        <h2 className="mb-1 flex items-center text-lg font-medium text-(--color-text)">
          Host a new online draft
          <HelpTip
            label="How online drafts work"
            text="Create a draft from the selected cube, then share the code. Each player opens the code on their own device and picks their seat. Turns follow snake order and everyone sees every pick — you can draft asynchronously over hours or days."
          />
        </h2>
        <p className="mb-4 text-sm text-(--color-text-dim)">
          Hosting from <span className="text-(--color-text)">{cube.name}</span> (
          {cubeSize} cards).
        </p>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-(--color-text-dim)">Players</span>
          <input
            type="number"
            min={MIN_SEATS}
            max={MAX_SEATS}
            value={seatCount}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n))
                setSeatCount(Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.round(n))));
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
              if (Number.isFinite(n)) setCardsPerSeat(Math.max(1, Math.round(n)));
            }}
            className="w-24 rounded border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text)"
          />
          <span className="ml-3 text-xs text-(--color-text-dim)">
            {seatCount * effectivePerSeat} of {cubeSize} cards will be drafted.
          </span>
        </label>

        <button
          type="button"
          onClick={handleCreate}
          disabled={busy}
          className="rounded-lg bg-(--color-accent) px-5 py-2.5 text-sm font-semibold text-black hover:bg-(--color-accent-bright) disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create draft & get code"}
        </button>
      </div>
    </div>
  );
}
