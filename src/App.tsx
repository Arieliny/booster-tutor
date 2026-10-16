import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
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
import { Inventory } from "./components/Inventory";
import { CubeCobraStatus } from "./components/CubeCobraStatus";
import { isCubeCobraCube } from "./lib/cubecobra";
import { Modal } from "./components/Modal";
import { PackDisplay } from "./components/PackDisplay";
import { PoolStatus } from "./components/PoolStatus";
import { Spotlight } from "./components/Spotlight";
import {
  TAB_TITLES,
  allowedSections,
  initialTab,
  onNavigate,
  pathForTab,
  pathShowsTab,
  rememberTab,
  sectionOf,
  tabAllowed,
  tabFromPath,
  tabUsesCube,
  type Section,
  type Tab,
} from "./lib/routes";
import { useAuth } from "./lib/auth-context";
import { AccountMenu } from "./components/AccountMenu";
import { LifeCounter } from "./components/LifeCounter";
import { PlayModeSwitch } from "./components/PlayModeSwitch";
import { AppShell } from "./components/AppShell";
import { PageHeader } from "./components/PageHeader";
import { SyncChip } from "./components/SyncChip";
import { startUserSync } from "./lib/user-sync";

// The set-review data file is large and rarely opened; keep it out of the
// initial bundle and fetch it only when the tab is selected.
const SetReview = lazy(() =>
  import("./components/SetReview").then((m) => ({ default: m.SetReview })),
);
const CubeReview = lazy(() =>
  import("./components/CubeReview").then((m) => ({ default: m.CubeReview })),
);
const Admin = lazy(() => import("./components/Admin").then((m) => ({ default: m.Admin })));
const Judge = lazy(() => import("./components/Judge").then((m) => ({ default: m.Judge })));
const LookUp = lazy(() => import("./components/CubeReview").then((m) => ({ default: m.LookUp })));
const SetReviewPrint = lazy(() =>
  import("./components/SetReviewPrint").then((m) => ({ default: m.SetReviewPrint })),
);

type View =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

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
  /** Set when the manager should open straight into a Cube Cobra refresh. */
  const [managerRefreshId, setManagerRefreshId] = useState<string | undefined>();
  const [showPickedLog, setShowPickedLog] = useState(false);
  const { me } = useAuth();
  const isOwner = me.role === "owner";

  // Cube review data follows the owner across devices (lib/user-sync.ts).
  // Guests can't use Cube review, so there's nothing of theirs to sync yet.
  useEffect(() => {
    if (me.role !== "owner") return;
    return startUserSync(me.id);
  }, [me.id, me.role]);
  const [requestedTab, setTabState] = useState<Tab>(() => initialTab(window.location.pathname));
  // Only the sections this person may use; a screen they can't open (an old
  // link, a remembered tab, or access since removed) falls back to their first.
  const sections = allowedSections(me);
  const noAccess = sections.length === 0;
  const tab: Tab = tabAllowed(requestedTab, me) ? requestedTab : (sections[0]?.tab ?? "packs");
  // Bumped by every nav tap, so tapping "My cube" from inside one of its lists
  // goes back to its home page.
  const [navCount, setNavCount] = useState(0);
  // Tapping Play goes back to whichever of packs / life was last open.
  const lastPlay = useRef<Tab>("packs");
  useEffect(() => {
    if (tab === "packs" || tab === "life") lastPlay.current = tab;
  }, [tab]);

  /** Switch tab and reflect it in the URL so each view is linkable. */
  const setTab = (next: Tab) => {
    setTabState(next);
    const path = pathForTab(next);
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  };

  // Keep the back/forward buttons working.
  useEffect(() => {
    const onPop = () => setTabState(tabFromPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Keep the URL on the tab actually shown, without adding history: tidies an
  // unrecognized path, turns a bare "/" into the resumed tab's, and corrects a
  // tab this person can't open (e.g. a guest following an old /admin link).
  useEffect(() => {
    if (!pathShowsTab(window.location.pathname, tab)) window.history.replaceState(null, "", pathForTab(tab));
  }, [tab]);

  // A screen asked to open another (e.g. a card popup's "Ask the judge").
  useEffect(
    () =>
      onNavigate((next) => {
        setNavCount((n) => n + 1);
        setTabState(next);
        const path = pathForTab(next);
        if (window.location.pathname !== path) window.history.pushState(null, "", path);
        window.scrollTo(0, 0);
      }),
    [],
  );

  // Reopen on whichever mode was used last.
  useEffect(() => rememberTab(tab), [tab]);

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

  if (noAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-sm space-y-3 rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-6 text-center">
          <div className="text-lg font-semibold text-(--color-text)">Hi {me.name}</div>
          <p className="text-sm text-(--color-text-dim)">
            You're signed in, but nothing has been switched on for you yet. Ask Ari to give you access.
          </p>
          <div className="flex justify-center">
            <AccountMenu onAdmin={() => {}} />
          </div>
        </div>
      </div>
    );
  }

  const inSpotlight = pack !== null && spotlightIndex !== null;
  const onPacksTab = tab === "packs";

  const navigate = (s: Section) => {
    const target = s === "play" && tabAllowed(lastPlay.current, me) ? lastPlay.current : sections.find((x) => x.id === s)?.tab;
    if (!target) return;
    setNavCount((n) => n + 1);
    setTab(target);
    window.scrollTo(0, 0);
  };

  const loading = (what: string) => <p className="text-(--color-text-dim)">Loading {what}…</p>;

  return (
    <AppShell
      nav={sections}
      active={sectionOf(tab)}
      onNavigate={navigate}
      title={TAB_TITLES[tab]}
      right={
        <>
          {isOwner && (tab === "cubeReview" || tab === "lookup") && <SyncChip />}
          <AccountMenu
            onAdmin={() => setTab("admin")}
            onManageCubes={isOwner ? () => setShowCubeManager(true) : undefined}
          />
        </>
      }
    >
      {tabUsesCube(tab) ? (
        <div className="space-y-4">
          {!onPacksTab && (
            <PageHeader title="Collection checklist" onBack={() => setTab("cubeReview")} backLabel="Back to My cube" />
          )}

          {onPacksTab && !inSpotlight && <PlayModeSwitch value="packs" onChange={setTab} />}

          {/* The cube in play, and how much of it is left this match. */}
          {!inSpotlight && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-3 py-2">
              <div className="flex min-w-0 flex-col items-start gap-1">
                <CubeSelector
                  cubes={visibleCubes}
                  selectedId={selectedCubeId}
                  onSelect={handleSelectCube}
                  onManage={isOwner ? () => setShowCubeManager(true) : undefined}
                />
                {isOwner && selectedCube && isCubeCobraCube(selectedCube) && (
                  <CubeCobraStatus
                    cube={selectedCube}
                    onRefresh={() => {
                      setManagerRefreshId(selectedCube.id);
                      setShowCubeManager(true);
                    }}
                  />
                )}
              </div>
              {onPacksTab && (
                <div className="ml-auto flex items-center gap-3">
                  <PoolStatus remaining={pool.length} total={selectedCube?.cards.length ?? 0} />
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    disabled={pickedIds.size === 0}
                    className="rounded border border-(--color-border) px-3 py-1.5 text-sm text-(--color-text-dim) hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          )}

          {onPacksTab ? (
            <>
              {!inSpotlight && (
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
                        <li key={c.scryfall_id} className="truncate text-(--color-text-dim)">
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
        </div>
      ) : tab === "review" ? (
        <Suspense fallback={loading("set grades")}>
          <SetReview onPrintView={() => setTab("reviewPrint")} />
        </Suspense>
      ) : tab === "reviewPrint" ? (
        <Suspense fallback={loading("set grades")}>
          <SetReviewPrint onBack={() => setTab("review")} />
        </Suspense>
      ) : tab === "cubeReview" ? (
        <Suspense fallback={loading("your cube")}>
          <CubeReview key={navCount} onOpenChecklist={() => setTab("inventory")} />
        </Suspense>
      ) : tab === "life" ? (
        // Full screen over the app; Exit (in its middle bar) goes back to packs.
        <LifeCounter onExit={() => setTab("packs")} />
      ) : tab === "judge" ? (
        <Suspense fallback={loading("the judge")}>
          <Judge />
        </Suspense>
      ) : tab === "lookup" ? (
        <Suspense fallback={loading("card search")}>
          <LookUp key={navCount} />
        </Suspense>
      ) : (
        <Suspense fallback={loading("people")}>
          <Admin />
        </Suspense>
      )}

      {showCubeManager && (
        <CubeManager
          cubes={cubes}
          selectedId={selectedCubeId}
          refreshCubeId={managerRefreshId}
          canEdit={isOwner}
          onClose={() => {
            setShowCubeManager(false);
            setManagerRefreshId(undefined);
          }}
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
          <h2 className="mb-2 text-lg font-medium text-(--color-text)">Reset session?</h2>
          <p className="mb-4 text-(--color-text-dim)">
            This will return all {pickedIds.size} picked cards in{" "}
            <span className="text-(--color-text)">{selectedCube?.name}</span> to the pool.
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
    </AppShell>
  );
}

export default App;
