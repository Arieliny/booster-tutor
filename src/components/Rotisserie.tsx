import { useState } from "react";
import type { Cube } from "../types";
import {
  clearDraft,
  createDraft,
  loadDraft,
  saveDraft,
  type RotisserieState,
} from "../lib/rotisserie";
import { RotisserieBoard } from "./RotisserieBoard";
import { RotisserieLobby } from "./RotisserieLobby";

interface Props {
  cube: Cube;
}

/**
 * Rotisserie tab container: owns the draft state for the selected cube,
 * persists it to localStorage, and switches between the lobby (setup) and the
 * board (in-progress draft).
 *
 * App.tsx mounts this with `key={cube.id}`, so switching cubes remounts the
 * component fresh — that's why the saved draft is read in a lazy initializer
 * rather than a cube-change effect.
 */
export function Rotisserie({ cube }: Props) {
  const [draft, setDraft] = useState<RotisserieState | null>(() =>
    loadDraft(cube.id),
  );
  // "lobby" shows setup; "board" shows the active draft. Start on the board if
  // a saved draft was loaded for this cube.
  const [screen, setScreen] = useState<"lobby" | "board">(() =>
    loadDraft(cube.id) ? "board" : "lobby",
  );

  const update = (next: RotisserieState) => {
    setDraft(next);
    saveDraft(next);
  };

  const handleStart = (seatNames: string[], cardsPerSeat: number) => {
    const fresh = createDraft(cube.id, seatNames, cardsPerSeat);
    update(fresh);
    setScreen("board");
  };

  const handleNewDraft = () => {
    clearDraft(cube.id);
    setDraft(null);
    setScreen("lobby");
  };

  if (screen === "board" && draft) {
    return (
      <RotisserieBoard
        cube={cube}
        state={draft}
        onChange={update}
        onNewDraft={handleNewDraft}
      />
    );
  }

  return (
    <RotisserieLobby
      cube={cube}
      existingDraft={draft}
      onStart={handleStart}
      onResume={() => setScreen("board")}
      onDiscard={handleNewDraft}
    />
  );
}
