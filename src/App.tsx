import { useEffect, useMemo, useState } from "react";
import cubeJson from "./data/cube.json";
import type { CubeCard, CubeData, GenerationMode } from "./types";
import { generatePack } from "./lib/pack-generator";
import { clearState, loadState, saveState } from "./lib/storage";
import { Controls } from "./components/Controls";
import { PackDisplay } from "./components/PackDisplay";
import { PoolStatus } from "./components/PoolStatus";

const CUBE = cubeJson as CubeData;

function App() {
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<GenerationMode>("color-balanced");
  const [pack, setPack] = useState<CubeCard[] | null>(null);
  const [packWarning, setPackWarning] = useState<string | undefined>();
  const [pendingPick, setPendingPick] = useState<CubeCard | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showPickedLog, setShowPickedLog] = useState(false);

  // Load persisted state on mount
  useEffect(() => {
    const persisted = loadState();
    setPickedIds(new Set(persisted.pickedCardIds));
  }, []);

  const pool = useMemo(() => {
    return CUBE.cards.filter((c) => !pickedIds.has(c.scryfall_id));
  }, [pickedIds]);

  const pickedCards = useMemo(() => {
    return CUBE.cards.filter((c) => pickedIds.has(c.scryfall_id));
  }, [pickedIds]);

  const handleGenerate = () => {
    try {
      const result = generatePack(pool, mode);
      setPack(result.cards);
      setPackWarning(result.warning);
      setHighlightId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPackWarning(msg);
    }
  };

  const handlePickClick = (card: CubeCard) => {
    setPendingPick(card);
  };

  const confirmPick = () => {
    if (!pendingPick) return;
    const id = pendingPick.scryfall_id;
    const next = new Set(pickedIds);
    next.add(id);
    setPickedIds(next);
    saveState({
      pickedCardIds: Array.from(next),
      lastUpdated: new Date().toISOString(),
    });
    setHighlightId(id);
    setPendingPick(null);
    // Clear the pack after a brief highlight
    setTimeout(() => {
      setPack(null);
      setHighlightId(null);
      setPackWarning(undefined);
    }, 600);
  };

  const cancelPick = () => setPendingPick(null);

  const handleReset = () => {
    setPickedIds(new Set());
    clearState();
    setPack(null);
    setPackWarning(undefined);
    setShowResetConfirm(false);
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-(--color-border) pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-text) sm:text-3xl">
            Booster Tutor
          </h1>
          <p className="text-xs text-(--color-text-dim)">Cube pack simulator</p>
        </div>
        <div className="flex items-center gap-4">
          <PoolStatus remaining={pool.length} total={CUBE.card_count} />
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            disabled={pickedIds.size === 0}
            className="rounded border border-(--color-border) px-3 py-1.5 text-sm text-(--color-text-dim) hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </header>

      <div className="mb-6">
        <Controls
          mode={mode}
          onModeChange={setMode}
          onGenerate={handleGenerate}
          poolEmpty={pool.length === 0}
        />
      </div>

      <PackDisplay
        pack={pack}
        warning={packWarning}
        onPick={handlePickClick}
        highlightedId={highlightId}
      />

      {pickedCards.length > 0 && (
        <div className="mt-8 border-t border-(--color-border) pt-4">
          <button
            type="button"
            onClick={() => setShowPickedLog((s) => !s)}
            className="text-sm text-(--color-text-dim) hover:text-(--color-text)"
          >
            {showPickedLog ? "Hide" : "Show"} picked cards ({pickedCards.length})
          </button>
          {showPickedLog && (
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-4">
              {pickedCards.map((c) => (
                <li key={c.scryfall_id} className="truncate text-(--color-text-dim)">
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {pendingPick && (
        <Modal onClose={cancelPick}>
          <h2 className="mb-2 text-lg font-medium text-(--color-text)">
            Add to your hand?
          </h2>
          <p className="mb-4 text-(--color-text-dim)">
            <span className="text-(--color-text)">{pendingPick.name}</span> will
            be removed from the pool for the rest of this session.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelPick}
              className="rounded border border-(--color-border) px-4 py-2 text-sm text-(--color-text-dim) hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmPick}
              className="rounded bg-(--color-accent) px-4 py-2 text-sm font-medium text-black hover:bg-(--color-accent-bright)"
            >
              Confirm
            </button>
          </div>
        </Modal>
      )}

      {showResetConfirm && (
        <Modal onClose={() => setShowResetConfirm(false)}>
          <h2 className="mb-2 text-lg font-medium text-(--color-text)">
            Reset session?
          </h2>
          <p className="mb-4 text-(--color-text-dim)">
            This will return all {pickedIds.size} picked cards to the pool.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowResetConfirm(false)}
              className="rounded border border-(--color-border) px-4 py-2 text-sm text-(--color-text-dim) hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
            >
              Reset
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default App;
