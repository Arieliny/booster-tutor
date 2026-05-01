import { useEffect, useMemo, useState } from "react";
import type { Cube, CubeCard, GenerationMode } from "./types";
import { DEFAULT_PACK_SIZE, generatePack } from "./lib/pack-generator";
import {
  bootstrap,
  loadSession,
  resetSession,
  saveSession,
  selectCube,
} from "./lib/cube-store";
import { Controls } from "./components/Controls";
import { CubeManager } from "./components/CubeManager";
import { CubeSelector } from "./components/CubeSelector";
import { Footer } from "./components/Footer";
import { Inventory } from "./components/Inventory";
import { Modal } from "./components/Modal";
import { PackDisplay } from "./components/PackDisplay";
import { PoolStatus } from "./components/PoolStatus";
import { Spotlight } from "./components/Spotlight";

type View =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

type Tab = "packs" | "inventory";

function App() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [cubes, setCubes] = useState<Cube[]>([]);
  const [selectedCubeId, setSelectedCubeId] = useState<string>("");
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());

  const [mode, setMode] = useState<GenerationMode>("random");
  const [packSize, setPackSize] = useState<number>(DEFAULT_PACK_SIZE);

  const [pack, setPack] = useState<CubeCard[] | null>(null);
  const [packWarning, setPackWarning] = useState<string | undefined>();
  const [spotlightIndex, setSpotlightIndex] = useState<number | null>(null);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showCubeManager, setShowCubeManager] = useState(false);
  const [showPickedLog, setShowPickedLog] = useState(false);
  const [tab, setTab] = useState<Tab>("packs");

  // Bootstrap on mount.
  useEffect(() => {
    (async () => {
      try {
        const { cubes, selectedCubeId } = await bootstrap();
        setCubes(cubes);
        setSelectedCubeId(selectedCubeId);
        if (selectedCubeId) {
          const session = await loadSession(selectedCubeId);
          setPickedIds(new Set(session.pickedCardIds));
        }
        setView({ kind: "ready" });
      } catch (err) {
        setView({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, []);

  const visibleCubes = useMemo(
    () => cubes.filter((c) => !c.archived),
    [cubes],
  );

  const selectedCube = useMemo(
    () => cubes.find((c) => c.id === selectedCubeId),
    [cubes, selectedCubeId],
  );

  const pool = useMemo(() => {
    if (!selectedCube) return [];
    return selectedCube.cards.filter((c) => !pickedIds.has(c.scryfall_id));
  }, [selectedCube, pickedIds]);

  const pickedCards = useMemo(() => {
    if (!selectedCube) return [];
    return selectedCube.cards.filter((c) => pickedIds.has(c.scryfall_id));
  }, [selectedCube, pickedIds]);

  const handleSelectCube = async (id: string) => {
    setSelectedCubeId(id);
    await selectCube(id);
    const session = await loadSession(id);
    setPickedIds(new Set(session.pickedCardIds));
    setPack(null);
    setSpotlightIndex(null);
    setPackWarning(undefined);
  };

  const tryGenerate = (poolToUse: readonly CubeCard[]) => {
    try {
      const result = generatePack(poolToUse, mode, packSize);
      setPack(result.cards);
      setPackWarning(result.warning);
      setSpotlightIndex(null);
    } catch (err) {
      setPackWarning(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOpenSameMatch = () => {
    tryGenerate(pool);
  };

  const handleOpenNewMatch = async () => {
    if (!selectedCubeId) return;
    setPickedIds(new Set());
    await resetSession(selectedCubeId);
    if (selectedCube) tryGenerate(selectedCube.cards);
  };

  const handleConfirmPick = async () => {
    if (spotlightIndex === null || !pack) return;
    const card = pack[spotlightIndex];
    if (!card) return;
    const next = new Set(pickedIds);
    next.add(card.scryfall_id);
    setPickedIds(next);
    await saveSession(selectedCubeId, Array.from(next));
    // Brief pause then clear the pack.
    setSpotlightIndex(null);
    setTimeout(() => {
      setPack(null);
      setPackWarning(undefined);
    }, 400);
  };

  const handleReset = async () => {
    if (!selectedCubeId) return;
    setPickedIds(new Set());
    await resetSession(selectedCubeId);
    setPack(null);
    setSpotlightIndex(null);
    setPackWarning(undefined);
    setShowResetConfirm(false);
  };

  if (view.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-(--color-text-dim)">
        Loading…
      </div>
    );
  }

  if (view.kind === "error") {
    return (
      <div className="mx-auto max-w-2xl p-8 text-(--color-text)">
        <h1 className="mb-4 text-2xl">Something went wrong</h1>
        <p className="text-(--color-text-dim)">{view.message}</p>
      </div>
    );
  }

  const inSpotlight = pack !== null && spotlightIndex !== null;
  const onPacksTab = tab === "packs";

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-(--color-border) pb-4">
          <div>
            <h1 className="text-2xl font-semibold text-(--color-text) sm:text-3xl">
              Booster Tutor
            </h1>
            <p className="text-xs text-(--color-text-dim)">Cube pack simulator</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <CubeSelector
              cubes={visibleCubes}
              selectedId={selectedCubeId}
              onSelect={handleSelectCube}
              onManage={() => setShowCubeManager(true)}
            />
            {onPacksTab && (
              <>
                <PoolStatus
                  remaining={pool.length}
                  total={selectedCube?.cards.length ?? 0}
                />
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  disabled={pickedIds.size === 0}
                  className="rounded border border-(--color-border) px-3 py-1.5 text-sm text-(--color-text-dim) hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reset
                </button>
              </>
            )}
          </div>
        </header>

        <nav
          role="tablist"
          aria-label="View"
          className="mb-6 inline-flex overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg-elev)"
        >
          {([
            { id: "packs", label: "Open packs" },
            { id: "inventory", label: "Inventory" },
          ] as { id: Tab; label: string }[]).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={
                "px-4 py-2 text-sm transition-colors " +
                (tab === t.id
                  ? "bg-(--color-accent) text-black font-medium"
                  : "text-(--color-text-dim) hover:bg-white/5")
              }
            >
              {t.label}
            </button>
          ))}
        </nav>

        {onPacksTab ? (
          <>
            {!inSpotlight && (
              <div className="mb-6">
                <Controls
                  mode={mode}
                  onModeChange={setMode}
                  packSize={packSize}
                  onPackSizeChange={setPackSize}
                  onOpenSameMatch={handleOpenSameMatch}
                  onOpenNewMatch={handleOpenNewMatch}
                  poolEmpty={pool.length === 0}
                  hasPickedCards={pickedIds.size > 0}
                />
              </div>
            )}

            {inSpotlight && pack ? (
              <Spotlight
                pack={pack}
                initialIndex={spotlightIndex!}
                onSelectIndex={setSpotlightIndex}
                onConfirm={handleConfirmPick}
                onBack={() => setSpotlightIndex(null)}
              />
            ) : (
              <PackDisplay
                pack={pack}
                warning={packWarning}
                onSpotlight={setSpotlightIndex}
                onOpenPack={handleOpenSameMatch}
                emptyDisabled={pool.length === 0}
              />
            )}

            {pickedCards.length > 0 && !inSpotlight && (
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
                      <li
                        key={c.scryfall_id}
                        className="truncate text-(--color-text-dim)"
                      >
                        {c.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        ) : (
          selectedCube && <Inventory cube={selectedCube} />
        )}

        {showCubeManager && (
          <CubeManager
            cubes={cubes}
            selectedId={selectedCubeId}
            onClose={() => setShowCubeManager(false)}
            onCubesChanged={async ({ cubes: nextCubes, selectedId }) => {
              setCubes(nextCubes);
              if (selectedId !== selectedCubeId) {
                setSelectedCubeId(selectedId);
                await selectCube(selectedId);
                const session = await loadSession(selectedId);
                setPickedIds(new Set(session.pickedCardIds));
                setPack(null);
                setSpotlightIndex(null);
              }
            }}
          />
        )}

        {showResetConfirm && (
          <Modal onClose={() => setShowResetConfirm(false)}>
            <h2 className="mb-2 text-lg font-medium text-(--color-text)">
              Reset session?
            </h2>
            <p className="mb-4 text-(--color-text-dim)">
              This will return all {pickedIds.size} picked cards in{" "}
              <span className="text-(--color-text)">{selectedCube?.name}</span> to
              the pool.
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
      <Footer />
    </div>
  );
}

export default App;
