import { useState } from "react";
import type { Cube } from "../types";
import {
  clearDraft,
  createDraft,
  loadDraft,
  saveDraft,
  type RotisserieState,
} from "../lib/rotisserie";
import { getActiveDraft } from "../lib/rotisserie-net";
import { RotisserieBoard } from "./RotisserieBoard";
import { RotisserieLobby } from "./RotisserieLobby";
import { RotisserieOnline } from "./RotisserieOnline";

interface Props {
  cube: Cube;
}

type Mode = "local" | "online";

/**
 * Rotisserie tab container. Offers two modes:
 *   - "local": pass-and-play on one device (Phase 1), draft state persisted
 *     per cube in localStorage.
 *   - "online": networked, server-authoritative draft (Phase 2).
 *
 * App.tsx mounts this with `key={cube.id}`, so switching cubes remounts fresh —
 * hence the lazy initializers rather than cube-change effects.
 */
export function Rotisserie({ cube }: Props) {
  const [mode, setMode] = useState<Mode>(() =>
    getActiveDraft() ? "online" : "local",
  );

  const [draft, setDraft] = useState<RotisserieState | null>(() =>
    loadDraft(cube.id),
  );
  const [screen, setScreen] = useState<"lobby" | "board">(() =>
    loadDraft(cube.id) ? "board" : "lobby",
  );

  const update = (next: RotisserieState) => {
    setDraft(next);
    saveDraft(next);
  };

  const handleStart = (seatNames: string[], cardsPerSeat: number) => {
    update(createDraft(cube.id, seatNames, cardsPerSeat));
    setScreen("board");
  };

  const handleNewDraft = () => {
    clearDraft(cube.id);
    setDraft(null);
    setScreen("lobby");
  };

  return (
    <div className="space-y-5">
      <div className="inline-flex overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg-elev)">
        {([
          { id: "local", label: "Pass & play" },
          { id: "online", label: "Online" },
        ] as { id: Mode; label: string }[]).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={
              "px-4 py-1.5 text-sm transition-colors " +
              (mode === m.id
                ? "bg-(--color-accent) text-black font-medium"
                : "text-(--color-text-dim) hover:bg-white/5")
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "online" ? (
        <RotisserieOnline cube={cube} />
      ) : screen === "board" && draft ? (
        <RotisserieBoard
          cube={cube}
          state={draft}
          onChange={update}
          onNewDraft={handleNewDraft}
        />
      ) : (
        <RotisserieLobby
          cube={cube}
          existingDraft={draft}
          onStart={handleStart}
          onResume={() => setScreen("board")}
          onDiscard={handleNewDraft}
        />
      )}
    </div>
  );
}
