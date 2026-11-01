import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CMC_FACETS,
  COLOR_FACETS,
  CUBE_KEYS,
  CUBE_SHORT,
  RARITY_FACETS,
  KEY_POLARITY,
  STATUSES,
  STATUS_LABEL,
  STATUS_SHORTCUT,
  TYPE_FACETS,
  allCardIds,
  allImageUrls,
  card,
  choicesFor,
  hasCard,
  isExtra,
  isLookedUp,
  normalizeStatus,
  persistIfLookedUp,
  registerLookup,
  scryfallCard,
  statusFor,
  summarize,
  cmcFacet,
  colorFacet,
  cubeUnion,
  artChoice,
  data,
  fallbackImageUrls,
  hasBackImage,
  scryfallPrintings,
  setArtChoice,
  frontName,
  hasType,
  historyEvents,
  imageUrl,
  inMyCube,
  cardTags,
  benchIds,
  owns,
  relevantCardIds,
  lastChange,
  loadDecisions,
  mergeDecisions,
  reloadSyncedData,
  logById,
  members,
  saveDecisions,
  storageWritable,
  searchText,
  setIds,
  shortDate,
  type CmcFacet,
  type ColorFacet,
  type CubeKey,
  type Decisions,
  type LogKey,
  type Printing,
  type ReviewCard,
  type Status,
  type Summary,
  type TypeFacet,
} from "../lib/cube-review";
import { gradeTone, primaryGrade, setReview, type SetReviewCard } from "../lib/set-review";
import { ManaCost } from "./ManaCost";
import { PIP_STYLE, SYMBOL_URI } from "../lib/mana";
import { OfflinePanel } from "./OfflinePanel";
import { CubeReviewSummary, DecisionsSync } from "./CubeReviewSummary";
import { CubeShape } from "./CubeShape";
import { ARCHETYPES, ROLES, ROLE_LABEL, parseTag, type Role } from "../lib/archetypes";
import { CardLookup } from "./CardLookup";
import { useCardDb } from "../lib/card-db";
import { REMOTE_CHANGE_EVENT } from "../lib/user-sync";
import { useBackToClose } from "../lib/use-back-to-close";
import { useAuth } from "../lib/auth-context";
import { can } from "../lib/auth";
import { startQuestionAbout } from "../lib/judge";
import { navigateTo } from "../lib/routes";
import { Rulings } from "./Rulings";
import { Icon, type IconName } from "./Icon";
import { PageHeader } from "./PageHeader";
import { Sheet } from "./Sheet";

type View = "home" | "compare" | "changelog" | "all" | "decisions" | "summary" | "shape" | "bench";
type Member = "in" | "out" | "any";
type LogTag = "all" | "current" | "past" | "tried";
type Layout = "grid" | "list";
type SortKey = "name" | "cmc" | "recent" | "grade";
type StatusFilter = Status | "none";

interface Ui {
  member: Record<CubeKey, Member>;
  log: LogKey;
  logTag: LogTag;
  hideMine: boolean;
  layout: Partial<Record<View, Layout>>;
  sort: Partial<Record<View, SortKey>>;
  colors: ColorFacet[];
  types: TypeFacet[];
  cmcs: CmcFacet[];
  rarities: string[];
  statuses: StatusFilter[];
  /** Base cube filter: only base cards, only the rest ("flex"), or all. */
  base: "any" | "base" | "flex";
  /** Only cards tagged for this archetype ("" = any). */
  archetype: string;
  autoAdvance: boolean;
}

const DEFAULT_UI: Ui = {
  member: { mine: "out", lsv: "in", mtgo: "any", arena: "any" },
  log: "lsv",
  logTag: "all",
  hideMine: false,
  layout: {},
  sort: {},
  colors: [],
  types: [],
  cmcs: [],
  rarities: [],
  statuses: [],
  base: "any",
  archetype: "",
  autoAdvance: true,
};

const UI_KEY = "booster-tutor-cube-review-ui-v1";
const ANY_MEMBER: Record<CubeKey, Member> = { mine: "any", lsv: "any", mtgo: "any", arena: "any" };

function loadUi(): Ui {
  try {
    const s = localStorage.getItem(UI_KEY);
    if (!s) return DEFAULT_UI;
    const saved = JSON.parse(s) as Partial<Ui>;
    // Saved before a cube was added (Arena, 2026-10-29): the new one starts at "Either".
    return { ...DEFAULT_UI, ...saved, member: { ...ANY_MEMBER, ...saved.member } };
  } catch {
    return DEFAULT_UI;
  }
}

const VIEW_TITLE: Record<View, string> = {
  home: "My cube",
  compare: "Compare cubes",
  changelog: "Changelogs",
  all: "All cards",
  decisions: "Your decisions",
  summary: "Summary and export",
  shape: "Cube shape",
  bench: "Bench",
};

const PRESETS: { label: string; m: Record<CubeKey, Member> }[] = [
  { label: "LSV has, I don't", m: { mine: "out", lsv: "in", mtgo: "any", arena: "any" } },
  { label: "I have, LSV doesn't", m: { mine: "in", lsv: "out", mtgo: "any", arena: "any" } },
  { label: "MTGO has, I don't", m: { mine: "out", lsv: "any", mtgo: "in", arena: "any" } },
  { label: "Arena has, I don't", m: { mine: "out", lsv: "any", mtgo: "any", arena: "in" } },
  { label: "Only mine", m: { mine: "in", lsv: "out", mtgo: "out", arena: "out" } },
  { label: "In all four", m: { mine: "in", lsv: "in", mtgo: "in", arena: "in" } },
  { label: "All cube cards", m: ANY_MEMBER },
];

const STATUS_TONE: Record<Status, string> = {
  keep: "bg-sky-500/25 text-sky-200",
  cut: "bg-red-500/25 text-red-200",
  add: "bg-emerald-500/25 text-emerald-200",
  no: "bg-slate-500/30 text-slate-200",
  maybe: "bg-amber-500/25 text-amber-200",
};

/** The card popup's ‹ / › buttons. */
const ARROW =
  "flex items-center justify-center rounded-lg border border-(--color-border) text-(--color-text-dim) touch-manipulation hover:bg-white/5 active:bg-white/10 disabled:opacity-30";

const STATUS_BUTTON: Record<Status, string> = {
  keep: "border-sky-500/60 bg-sky-500/25 text-sky-100",
  cut: "border-red-500/60 bg-red-500/25 text-red-100",
  add: "border-emerald-500/60 bg-emerald-500/25 text-emerald-100",
  no: "border-slate-400/60 bg-slate-500/30 text-slate-100",
  maybe: "border-amber-500/60 bg-amber-500/25 text-amber-100",
};

const PAGE = 240;

/** LR grades for the new set, matched on front-face name. */
const gradeByName = new Map<string, SetReviewCard>(
  setReview.cards.map((c) => [c.name.split(" // ")[0].toLowerCase(), c]),
);
function setGrade(c: ReviewCard): string | null {
  if (!setIds.has(c.id)) return null;
  const sr = gradeByName.get(frontName(c).toLowerCase());
  if (!sr) return null;
  const { grade } = primaryGrade(sr);
  return grade ?? (sr.tag === "sideboard" ? "SB" : null);
}
function gradeSortValue(c: ReviewCard): number {
  const g = setGrade(c);
  if (!g) return -1;
  if (g === "SB") return 0;
  const order = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
  return order.indexOf(g) + 1;
}

/** Cards matching every active facet + the search box. */
function facetFilter(ui: Ui, q: string, decisions: Decisions) {
  const needle = q.trim().toLowerCase();
  return (c: ReviewCard) => {
    if (ui.colors.length && !ui.colors.includes(colorFacet(c))) return false;
    if (ui.types.length && !ui.types.some((t) => hasType(c, t))) return false;
    if (ui.cmcs.length && !ui.cmcs.includes(cmcFacet(c))) return false;
    if (ui.rarities.length && !ui.rarities.includes(c.rarity)) return false;
    if (ui.statuses.length) {
      const s: StatusFilter = normalizeStatus(c.id, decisions[c.id]?.status) ?? "none";
      if (!ui.statuses.includes(s)) return false;
    }
    if (ui.base !== "any" && (ui.base === "base") !== !!decisions[c.id]?.base) return false;
    if (ui.archetype && !cardTags(c.id, decisions).some((t) => t.startsWith(ui.archetype + ":"))) return false;
    if (needle && !searchText(c).includes(needle)) return false;
    return true;
  };
}

function matchesMembers(id: string, m: Record<CubeKey, Member>) {
  return CUBE_KEYS.every((k) => m[k] === "any" || (m[k] === "in") === members[k].has(id));
}

/**
 * Everything the card screens share: your decisions, hand-added cards and
 * printing choices (kept in step with your other devices), the card database,
 * and the card popup. Used by My cube and Look up.
 */
function useReviewState() {
  const [decisions, setDecisions] = useState<Decisions>(loadDecisions);
  // Tested once: if storage is blocked, every save would fail the same way.
  const [saveFailed] = useState(() => !storageWritable());
  const [detail, setDetail] = useState<{ ids: string[]; index: number } | null>(null);
  // Bumped when hand-added cards change, so card lists recompute.
  const [extrasVersion, setExtrasVersion] = useState(0);
  // Bumped when a printing is chosen, so images re-render.
  const [artVersion, setArtVersion] = useState(0);
  const cardDb = useCardDb();

  const chooseArt = useCallback((id: string, p: Printing | null) => {
    setArtChoice(id, p ? { sid: p.sid, back: p.back || undefined, label: `${p.set} · ${p.released.slice(0, 4)}` } : null);
    setArtVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    saveDecisions(decisions);
  }, [decisions]);

  // Another device's changes arrived (lib/user-sync.ts): fold them in, newest
  // edit per card wins, so nothing tapped here a moment ago is lost.
  useEffect(() => {
    const onRemote = () => {
      reloadSyncedData();
      setDecisions((cur) => mergeDecisions(cur, loadDecisions()));
      setExtrasVersion((v) => v + 1);
      setArtVersion((v) => v + 1);
    };
    window.addEventListener(REMOTE_CHANGE_EVENT, onRemote);
    return () => window.removeEventListener(REMOTE_CHANGE_EVENT, onRemote);
  }, []);

  const setStatus = useCallback((id: string, s: Status) => {
    // Deciding on a card you only looked up keeps it on your list.
    if (persistIfLookedUp(id)) setExtrasVersion((v) => v + 1);
    setDecisions((d) => {
      const prev = d[id];
      // The same choice again clears it (compared in this card's own words).
      const status = normalizeStatus(id, prev?.status) === s ? undefined : s;
      return { ...d, [id]: { ...prev, status, t: Date.now() } };
    });
  }, []);

  /** Mark a card as part of the base cube (or not). A base card stays on your list even with no decision. */
  const setBase = useCallback((id: string, on: boolean) => {
    setDecisions((d) => ({ ...d, [id]: { ...d[id], base: on || undefined, t: Date.now() } }));
  }, []);

  /** Hand-set archetype tags; undefined goes back to the baked ones. */
  const setTags = useCallback((id: string, tags: string[] | undefined) => {
    setDecisions((d) => ({ ...d, [id]: { ...d[id], tags, t: Date.now() } }));
  }, []);

  /** Ari has a copy the proxy orders don't know about. */
  const setOwned = useCallback((id: string, on: boolean) => {
    if (persistIfLookedUp(id)) setExtrasVersion((v) => v + 1);
    setDecisions((d) => ({ ...d, [id]: { ...d[id], owned: on || undefined, t: Date.now() } }));
  }, []);

  const setNote = useCallback((id: string, note: string) => {
    if (persistIfLookedUp(id)) setExtrasVersion((v) => v + 1);
    setDecisions((d) => ({ ...d, [id]: { ...d[id], note: note || undefined, t: Date.now() } }));
  }, []);

  /**
   * Open a card from the card database or Scryfall. It's only looked at until
   * you tag it or write a note - then it joins your list (setStatus/setNote).
   */
  const openLookedUp = useCallback((c: ReviewCard) => {
    if (!hasCard(c.id)) registerLookup(c);
    setDetail({ ids: [c.id], index: 0 });
  }, []);

  const openFromScryfall = useCallback(
    async (name: string) => openLookedUp(await scryfallCard(name)),
    [openLookedUp],
  );

  // Live: what my cube becomes with every Cut and Add applied.
  const live = useMemo(() => summarize(decisions), [decisions]);

  /** Start loading the card database as soon as a search box is tapped, so the
   * ~1-2 s parse on a phone overlaps the typing. */
  const preloadDb = () => {
    if (cardDb.state.kind === "ready" && !cardDb.state.db) void cardDb.load();
  };

  return {
    decisions,
    setDecisions,
    saveFailed,
    detail,
    setDetail,
    extrasVersion,
    setExtrasVersion,
    artVersion,
    setArtVersion,
    cardDb,
    chooseArt,
    setStatus,
    setNote,
    setBase,
    setTags,
    setOwned,
    openLookedUp,
    openFromScryfall,
    live,
    preloadDb,
  };
}

const LIST_VIEWS: View[] = ["compare", "changelog", "all", "decisions", "summary", "shape", "bench"];

/** /my-cube/changelog -> "changelog"; /my-cube -> home. */
function viewFromPath(pathname: string): View {
  const m = pathname.toLowerCase().match(/^\/my-cube\/([a-z]+)/);
  return m && LIST_VIEWS.includes(m[1] as View) ? (m[1] as View) : "home";
}

function historyTitle(): string | undefined {
  return (window.history.state as { title?: string } | null)?.title;
}

/** Facets cleared whenever a list is opened from the home page. */
const CLEAN: Partial<Ui> = { colors: [], types: [], cmcs: [], rarities: [], statuses: [], base: "any", archetype: "" };

export function CubeReview({ onOpenChecklist }: { onOpenChecklist?: () => void }) {
  const st = useReviewState();
  const { decisions, detail, setDetail, extrasVersion, live, setStatus } = st;
  const [ui, setUi] = useState<Ui>(loadUi);
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname));
  // The home-page row a list was opened from ("New in LSV"), shown as its title.
  const [listTitle, setListTitle] = useState<string | undefined>(() => historyTitle());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [paging, setPaging] = useState({ key: "", n: PAGE });
  const [fullSize, setFullSize] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify(ui));
    } catch {
      // A remembered view is a convenience; nothing to do if storage is blocked.
    }
  }, [ui]);

  // Each list has its own URL, so the phone's Back button returns home.
  useEffect(() => {
    const onPop = () => {
      setView(viewFromPath(window.location.pathname));
      setListTitle(historyTitle());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const patch = useCallback((p: Partial<Ui>) => setUi((u) => ({ ...u, ...p })), []);

  /** Open a list from the home page, starting from a clean set of filters. */
  const goView = (v: View, preset: Partial<Ui> = {}, title?: string) => {
    patch({ ...CLEAN, ...preset });
    setQ("");
    setSelId(null);
    setView(v);
    setListTitle(title);
    window.history.pushState({ fromHome: true, title }, "", `/my-cube/${v}`);
    window.scrollTo(0, 0);
  };

  const goHome = () => {
    if ((window.history.state as { fromHome?: boolean } | null)?.fromHome) {
      window.history.back();
    } else {
      window.history.pushState(null, "", "/my-cube");
      setView("home");
    }
  };

  const layout: Layout = view === "home" ? "grid" : (ui.layout[view] ?? (view === "changelog" ? "list" : "grid"));
  const sort: SortKey = view === "home" ? "name" : (ui.sort[view] ?? (view === "changelog" ? "recent" : "name"));

  const presetCounts = useMemo(
    () => PRESETS.map((p) => cubeUnion.filter((id) => matchesMembers(id, p.m)).length),
    [],
  );

  const logCounts = useMemo(() => {
    const entries = data.changelogs[ui.log];
    return {
      all: entries.length,
      current: entries.filter((e) => e.current).length,
      past: entries.filter((e) => !e.current).length,
      tried: entries.filter((e) => e.adds.length && !e.current).length,
    };
  }, [ui.log]);

  const decided = useMemo(
    () => Object.entries(decisions).filter(([id, d]) => d.status && hasCard(id)),
    // extrasVersion: an import can bring in cards that make decisions visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decisions, extrasVersion],
  );

  const baseIds = useMemo((): string[] => {
    switch (view) {
      case "home":
        return [];
      case "compare":
        return cubeUnion.filter((id) => matchesMembers(id, ui.member));
      case "changelog":
        return data.changelogs[ui.log]
          .filter((e) =>
            ui.logTag === "current"
              ? e.current
              : ui.logTag === "past"
                ? !e.current
                : ui.logTag === "tried"
                  ? e.adds.length > 0 && !e.current
                  : true,
          )
          .filter((e) => !(ui.hideMine && members.mine.has(e.id)))
          .map((e) => e.id);
      case "decisions":
        return decided.map(([id]) => id);
      case "bench":
        return benchIds(decisions);
      default:
        return relevantCardIds(decisions);
    }
    // extrasVersion: hand-added cards join "All cards".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, ui.member, ui.log, ui.logTag, ui.hideMine, decided, decisions, extrasVersion]);

  const ids = useMemo(() => {
    const keep = facetFilter(ui, q, decisions);
    const list = baseIds.filter((id) => hasCard(id) && keep(card(id)));
    const byName = (a: string, b: string) => card(a).name.localeCompare(card(b).name);
    if (sort === "cmc") list.sort((a, b) => card(a).cmc - card(b).cmc || byName(a, b));
    else if (sort === "grade") list.sort((a, b) => gradeSortValue(card(b)) - gradeSortValue(card(a)) || byName(a, b));
    else if (sort === "recent" && view === "changelog") {
      const log = logById[ui.log];
      list.sort((a, b) => lastChange(log.get(b)!).localeCompare(lastChange(log.get(a)!)) || byName(a, b));
    } else list.sort(byName);
    // My decisions holds two different questions: cards in my cube (keep or
    // cut?) and new cards (add or not?). Group them so they're reviewed - and
    // stepped through in the popup - one question at a time.
    if (view === "decisions") return [...list.filter(inMyCube), ...list.filter((id) => !inMyCube(id))];
    return list;
  }, [baseIds, ui, q, decisions, sort, view]);

  const shownIds = useMemo(() => new Set(ids), [ids]);

  // What's still waiting for a decision, for the home page.
  const todo = useMemo(() => {
    const undecided = (id: string) => !normalizeStatus(id, decisions[id]?.status);
    const fresh = (log: LogKey) =>
      data.changelogs[log].filter((e) => e.current && !members.mine.has(e.id) && undecided(e.id)).length;
    return { lsv: fresh("lsv"), mtgo: fresh("mtgo"), arena: fresh("arena") };
  }, [decisions]);

  // Render a page at a time; any change to what's listed starts again at one page.
  const listKey = useMemo(
    () =>
      JSON.stringify([view, ui.member, ui.log, ui.logTag, ui.hideMine, ui.colors, ui.types, ui.cmcs, ui.rarities, ui.statuses, q, sort]),
    [view, ui.member, ui.log, ui.logTag, ui.hideMine, ui.colors, ui.types, ui.cmcs, ui.rarities, ui.statuses, q, sort],
  );
  const limit = paging.key === listKey ? paging.n : PAGE;
  const showAtLeast = useCallback((n: number) => setPaging({ key: listKey, n }), [listKey]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) showAtLeast(limit + PAGE);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ids.length, limit, showAtLeast]);

  const open = useCallback(
    (id: string) => {
      const index = ids.indexOf(id);
      if (index === -1) return;
      setSelId(id);
      // Snapshot the list so tagging a card (which can drop it out of a
      // status filter) doesn't reshuffle what next/previous means.
      setDetail({ ids: [...ids], index });
    },
    [ids, setDetail],
  );

  // Laptop keyboard: arrows move the cursor, Enter opens, K/C/A/M tag.
  useEffect(() => {
    if (detail || filtersOpen || view === "summary" || view === "shape" || view === "home") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.ctrlKey || e.metaKey || e.altKey || ids.length === 0) return;
      const cur = selId ? ids.indexOf(selId) : -1;
      const cols =
        layout === "grid" && gridRef.current
          ? getComputedStyle(gridRef.current).gridTemplateColumns.split(" ").length
          : 1;
      let next: number;
      if (e.key === "ArrowRight") next = cur + 1;
      else if (e.key === "ArrowLeft") next = cur - 1;
      else if (e.key === "ArrowDown") next = cur === -1 ? 0 : cur + cols;
      else if (e.key === "ArrowUp") next = cur - cols;
      else if ((e.key === "Enter" || e.key === " ") && selId) {
        e.preventDefault();
        open(selId);
        return;
      } else if (KEY_POLARITY[e.key.toLowerCase()] && selId) {
        setStatus(selId, statusFor(selId, KEY_POLARITY[e.key.toLowerCase()]));
        return;
      } else if (e.key.toLowerCase() === "b" && selId && inMyCube(selId)) {
        st.setBase(selId, !decisions[selId]?.base);
        return;
      } else return;
      e.preventDefault();
      next = Math.max(0, Math.min(ids.length - 1, next));
      if (next >= limit) showAtLeast(next + PAGE);
      setSelId(ids[next]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, filtersOpen, view, ids, selId, layout, limit, open, setStatus, showAtLeast, st, decisions]);

  useEffect(() => {
    if (!selId) return;
    document.querySelector(`[data-card="${selId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selId]);

  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const activeFilters =
    ui.colors.length + ui.types.length + ui.cmcs.length + ui.rarities.length + ui.statuses.length + (ui.base === "any" ? 0 : 1) + (ui.archetype ? 1 : 0);
  const clearFilters = () => patch({ colors: [], types: [], cmcs: [], rarities: [], statuses: [] });

  const offlineUrls = useMemo(
    () => (fullSize ? [...allImageUrls("small"), ...allImageUrls("normal")] : allImageUrls("small")),
    // artVersion: a chosen printing is what "Save images" should store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fullSize, st.artVersion],
  );

  const detailPopup = detail && (
    <CardDetail
      ids={detail.ids}
      index={detail.index}
      decisions={decisions}
      live={live}
      artVersion={st.artVersion}
      onChooseArt={st.chooseArt}
      autoAdvance={ui.autoAdvance}
      onAutoAdvance={(v) => patch({ autoAdvance: v })}
      onIndex={(index) => {
        setDetail((d) => (d ? { ...d, index } : d));
        setSelId(detail.ids[index]);
      }}
      onStatus={setStatus}
      onNote={st.setNote}
      onBase={st.setBase}
      onTags={st.setTags}
      onOwned={st.setOwned}
      onClose={() => setDetail(null)}
    />
  );

  const saveWarning = st.saveFailed && (
    <p className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
      This browser isn't saving your decisions (storage is blocked). Export them before closing the tab.
    </p>
  );

  if (view === "home") {
    const since = shortDate(data.changelogSince);
    return (
      <div className="space-y-5">
        {saveWarning}
        <HeroCount live={live} />

        <div className="grid gap-5 md:grid-cols-2">
          <HomeGroup title="To decide">
            <HomeRow
              icon="help"
              label="Maybes"
              sub={live.counts.maybe ? `${live.maybeCut} cut? · ${live.maybeAdd} add?` : "Cards you marked Maybe"}
              count={live.counts.maybe}
              onClick={() => goView("decisions", { statuses: ["maybe"] }, "Maybes")}
            />
            <HomeRow
              icon="history"
              label={`New in ${data.cubes.lsv.label}`}
              sub={`Added since ${since}, not in your cube`}
              count={todo.lsv}
              onClick={() =>
                goView("changelog", { log: "lsv", logTag: "current", hideMine: true, statuses: ["none"] }, `New in ${data.cubes.lsv.label}`)
              }
            />
            <HomeRow
              icon="history"
              label={`New in ${data.cubes.mtgo.label}`}
              sub={`Added since ${since}, not in your cube`}
              count={todo.mtgo}
              onClick={() =>
                goView("changelog", { log: "mtgo", logTag: "current", hideMine: true, statuses: ["none"] }, `New in ${data.cubes.mtgo.label}`)
              }
            />
            <HomeRow
              icon="history"
              label={`New in ${data.cubes.arena.label}`}
              sub={`Added since ${since}, not in your cube`}
              count={todo.arena}
              onClick={() =>
                goView("changelog", { log: "arena", logTag: "current", hideMine: true, statuses: ["none"] }, `New in ${data.cubes.arena.label}`)
              }
            />
          </HomeGroup>

          <HomeGroup title="Browse">
            <HomeRow
              icon="columns"
              label="Compare cubes"
              sub={`Yours, ${data.cubes.lsv.label}, ${data.cubes.mtgo.label} and ${data.cubes.arena.label}`}
              onClick={() => goView("compare")}
            />
            <HomeRow
              icon="history"
              label="Changelogs"
              sub={`Every change since ${since}`}
              onClick={() => goView("changelog", { logTag: "all", hideMine: false })}
            />
            <HomeRow icon="cards" label="All cards" onClick={() => goView("all")} />
            <HomeRow icon="list" label="Your decisions" count={decided.length} onClick={() => goView("decisions")} />
            <HomeRow icon="gauge" label="Cube shape" sub="Colours, types, curve and guilds after your decisions" onClick={() => goView("shape")} />
            <HomeRow
              icon="cardBack"
              label="Bench"
              sub="Cards you have that aren't in the cube: your cuts and old proxies"
              count={benchIds(decisions).length}
              onClick={() => goView("bench")}
            />
            <HomeRow icon="summary" label="Summary and export" onClick={() => goView("summary")} />
            {onOpenChecklist && (
              <HomeRow icon="check" label="Collection checklist" sub="Cards you've received" onClick={onOpenChecklist} />
            )}
          </HomeGroup>
        </div>

        <HomeGroup title="Offline">
          <div className="space-y-3 p-3">
            <OfflinePanel
              urls={offlineUrls}
              title="Save card images"
              intro="Every card's text already works with no connection."
              avgBytes={fullSize ? 53 * 1024 : 13 * 1024}
            >
              <label className="mb-3 flex items-center gap-2 text-(--color-text-dim)">
                <input type="checkbox" checked={fullSize} onChange={(e) => setFullSize(e.target.checked)} />
                Also save full-size images for the enlarged view (much bigger)
              </label>
            </OfflinePanel>
          </div>
        </HomeGroup>

        <p className="text-xs text-(--color-text-dim)" title="Refresh: node --use-system-ca scripts/build-cube-review.mjs, then deploy">
          Data from {shortDate(data.builtAt.slice(0, 10))} · {data.cubes.lsv.label} updated {shortDate(data.cubes.lsv.updated)} ·{" "}
          {data.cubes.mtgo.label} {shortDate(data.cubes.mtgo.updated)} · {data.cubes.arena.label} {shortDate(data.cubes.arena.updated)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={listTitle ?? VIEW_TITLE[view]}
        onBack={goHome}
        backLabel="Back to My cube"
        right={
          <span
            className="shrink-0 text-sm text-(--color-text-dim)"
            title={`${live.current} now − ${live.cuts.length} cut + ${live.adds.length} added`}
          >
            My cube <span className="font-semibold tabular-nums text-(--color-text)">{live.result}</span>
          </span>
        }
      />
      {saveWarning}

      {view === "summary" ? (
        <>
          <div className="flex justify-end">
            <DecisionsSync
              decisions={decisions}
              onImport={(d) => {
                st.setDecisions(d);
                st.setExtrasVersion((v) => v + 1);
                st.setArtVersion((v) => v + 1);
              }}
            />
          </div>
          <CubeReviewSummary decisions={decisions} onOpenCard={(id) => setDetail({ ids: [id], index: 0 })} />
        </>
      ) : view === "shape" ? (
        <CubeShape decisions={decisions} onOpenCards={(ids) => setDetail({ ids, index: 0 })} />
      ) : (
        <>
          {/* View-specific controls */}
          {view === "compare" && (
            <div className="space-y-3 rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-3">
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {CUBE_KEYS.map((k) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <span className="w-16 text-(--color-text) sm:w-auto">{data.cubes[k].label}</span>
                    <Segmented
                      value={ui.member[k]}
                      options={[
                        ["in", "In"],
                        ["out", "Not in"],
                        ["any", "Either"],
                      ]}
                      onChange={(v) => patch({ member: { ...ui.member, [k]: v } })}
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p, i) => {
                  const on = CUBE_KEYS.every((k) => ui.member[k] === p.m[k]);
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => patch({ member: p.m })}
                      className={
                        "rounded-full border px-3 py-1 text-xs " +
                        (on
                          ? "border-(--color-accent) bg-(--color-accent)/15 text-(--color-text)"
                          : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5")
                      }
                    >
                      {p.label} · {presetCounts[i]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {view === "changelog" && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-3">
              <Segmented
                value={ui.log}
                options={[
                  ["lsv", `LSV · ${data.changelogs.lsv.length}`],
                  ["mtgo", `MTGO · ${data.changelogs.mtgo.length}`],
                  ["arena", `Arena · ${data.changelogs.arena.length}`],
                ]}
                onChange={(v) => patch({ log: v })}
              />
              <Segmented
                value={ui.logTag}
                options={[
                  ["all", `All · ${logCounts.all}`],
                  ["current", `Current · ${logCounts.current}`],
                  ["past", `Past · ${logCounts.past}`],
                  ["tried", `Tried and cut · ${logCounts.tried}`],
                ]}
                onChange={(v) => patch({ logTag: v })}
              />
              <label className="flex items-center gap-2 text-sm text-(--color-text-dim)">
                <input
                  type="checkbox"
                  checked={ui.hideMine}
                  onChange={(e) => patch({ hideMine: e.target.checked })}
                />
                Hide cards in my cube
              </label>
            </div>
          )}

          {view === "decisions" && (
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-3">
              {STATUSES.map((s) => {
                const n = decided.filter(([id, d]) => normalizeStatus(id, d.status) === s).length;
                const on = ui.statuses.length === 1 && ui.statuses[0] === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => patch({ statuses: on ? [] : [s] })}
                    className={
                      "rounded-lg border px-3 py-1.5 text-sm " +
                      (on ? STATUS_BUTTON[s] : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5")
                    }
                  >
                    {STATUS_LABEL[s]} · {n}
                    {s === "maybe" && n > 0 && (
                      <span className="ml-1 text-xs opacity-80">
                        ({live.maybeCut} cut? · {live.maybeAdd} add?)
                      </span>
                    )}
                  </button>
                );
              })}
              {decided.length === 0 && (
                <span className="self-center text-sm text-(--color-text-dim)">
                  Tag cards in any list (Keep / Cut for your cube, Add / No for the rest, or Maybe) and they collect here.
                </span>
              )}
            </div>
          )}

          {/* Search, with the filters one tap away in a sheet. */}
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={st.preloadDb}
              placeholder="Search name or rules text"
              className="min-w-0 flex-1 rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-3 py-2 text-sm text-(--color-text) placeholder:text-(--color-text-dim)"
            />
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className={
                "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm " +
                (activeFilters
                  ? "border-(--color-accent) bg-(--color-accent)/15 text-(--color-text)"
                  : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5")
              }
            >
              <Icon name="filter" className="h-4 w-4" />
              Filters{activeFilters ? ` · ${activeFilters}` : ""}
            </button>
          </div>

          {filtersOpen && (
            <Sheet
              title="Filters"
              onClose={() => setFiltersOpen(false)}
              action={
                activeFilters > 0 && (
                  <button type="button" onClick={clearFilters} className="text-sm text-(--color-accent) hover:underline">
                    Clear all
                  </button>
                )
              }
              footer={
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="w-full rounded-lg bg-(--color-accent) py-2.5 text-sm font-semibold text-black hover:bg-(--color-accent-bright)"
                >
                  Show {ids.length} card{ids.length === 1 ? "" : "s"}
                </button>
              }
            >
              <div className="space-y-4">
                <FacetRow label="Color">
                  {COLOR_FACETS.map((f) => (
                    <ColorChip
                      key={f}
                      facet={f}
                      on={ui.colors.includes(f)}
                      onClick={() => patch({ colors: toggle(ui.colors, f) })}
                    />
                  ))}
                </FacetRow>
                <FacetRow label="Type">
                  {TYPE_FACETS.map((t) => (
                    <Chip key={t} on={ui.types.includes(t)} onClick={() => patch({ types: toggle(ui.types, t) })}>
                      {t}
                    </Chip>
                  ))}
                </FacetRow>
                <FacetRow label="Mana value">
                  {CMC_FACETS.map((m) => (
                    <Chip key={m} on={ui.cmcs.includes(m)} onClick={() => patch({ cmcs: toggle(ui.cmcs, m) })}>
                      {m}
                    </Chip>
                  ))}
                </FacetRow>
                <FacetRow label="Rarity">
                  {RARITY_FACETS.map((r) => (
                    <Chip
                      key={r}
                      on={ui.rarities.includes(r)}
                      onClick={() => patch({ rarities: toggle(ui.rarities, r) })}
                    >
                      {r[0].toUpperCase() + r.slice(1)}
                    </Chip>
                  ))}
                </FacetRow>
                <FacetRow label="Archetype">
                  {ARCHETYPES.map((a) => (
                    <Chip key={a.key} on={ui.archetype === a.key} onClick={() => patch({ archetype: ui.archetype === a.key ? "" : a.key })}>
                      {a.label}
                    </Chip>
                  ))}
                </FacetRow>
                <FacetRow label="Base cube">
                  <Chip on={ui.base === "base"} onClick={() => patch({ base: ui.base === "base" ? "any" : "base" })}>
                    Base
                  </Chip>
                  <Chip on={ui.base === "flex"} onClick={() => patch({ base: ui.base === "flex" ? "any" : "flex" })}>
                    Not base
                  </Chip>
                </FacetRow>
                <FacetRow label="Your decision">
                  {([...STATUSES, "none"] as StatusFilter[]).map((s) => (
                    <Chip
                      key={s}
                      on={ui.statuses.includes(s)}
                      onClick={() => patch({ statuses: toggle(ui.statuses, s) })}
                    >
                      {s === "none" ? "Undecided" : STATUS_LABEL[s]}
                    </Chip>
                  ))}
                </FacetRow>
              </div>
            </Sheet>
          )}

          <CardLookup q={q} exclude={shownIds} db={st.cardDb} onOpenCard={st.openLookedUp} onScryfall={st.openFromScryfall} />

          {/* Result bar */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-(--color-text)">
              {ids.length} card{ids.length === 1 ? "" : "s"}
            </span>
            {activeFilters > 0 && (
              <button type="button" onClick={clearFilters} className="text-xs text-(--color-accent) hover:underline">
                Clear filters
              </button>
            )}
            <span className="hidden text-xs text-(--color-text-dim) lg:inline">
              Arrows move · Enter opens · K/A yes · C/N no · M maybe
            </span>
            <span className="ml-auto flex items-center gap-2">
              <select
                value={sort}
                onChange={(e) => patch({ sort: { ...ui.sort, [view]: e.target.value as SortKey } })}
                className="rounded border border-(--color-border) bg-(--color-bg) px-2 py-1.5 text-sm text-(--color-text)"
                aria-label="Sort"
              >
                <option value="name">Name</option>
                <option value="cmc">Mana value</option>
                {view === "changelog" && <option value="recent">Newest change</option>}
              </select>
              <Segmented
                value={layout}
                options={[
                  ["grid", "Grid"],
                  ["list", "List"],
                ]}
                onChange={(v) => patch({ layout: { ...ui.layout, [view]: v } })}
              />
            </span>
          </div>

          {ids.length === 0 ? (
            <p className="rounded-lg border border-dashed border-(--color-border) p-8 text-center text-sm text-(--color-text-dim)">
              {activeFilters || q ? "No cards match. Loosen a filter or the search." : "Nothing here — all done."}
            </p>
          ) : (
            sectionsFor(view, ids, limit).map((section, si) => (
              <div key={section.key} className="space-y-2">
                {section.title && (
                  <h3 className="flex items-baseline gap-2 border-b border-(--color-border) pb-1 pt-2 text-sm font-semibold text-(--color-text)">
                    {section.title}
                    <span className="font-normal text-(--color-text-dim)">{section.total}</span>
                  </h3>
                )}
                {layout === "grid" ? (
                  <div
                    ref={si === 0 ? gridRef : undefined}
                    className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7"
                  >
                    {section.ids.map((id) => (
                      <Tile
                        key={id}
                        c={card(id)}
                        src={imageUrl(card(id), "small")}
                        status={normalizeStatus(id, decisions[id]?.status)}
                        base={!!decisions[id]?.base}
                        hasNote={!!decisions[id]?.note}
                        selected={selId === id}
                        onOpen={open}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="divide-y divide-(--color-border) rounded-lg border border-(--color-border)">
                    {section.ids.map((id) => (
                      <Row
                        key={id}
                        c={card(id)}
                        log={view === "changelog" ? ui.log : null}
                        status={normalizeStatus(id, decisions[id]?.status)}
                        base={!!decisions[id]?.base}
                        selected={selId === id}
                        onOpen={open}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          {limit < ids.length && <div ref={sentinelRef} className="h-10" />}
        </>
      )}

      {detailPopup}
    </div>
  );
}

/** Cards in the review data whose name (first) or rules text matches. */
function searchReviewCards(needle: string, max: number): string[] {
  const tiers: string[][] = [[], [], []];
  for (const id of allCardIds()) {
    const c = card(id);
    const name = c.name.toLowerCase();
    if (name.startsWith(needle)) tiers[0].push(id);
    else if (name.includes(needle)) tiers[1].push(id);
    else if (searchText(c).includes(needle)) tiers[2].push(id);
  }
  const byName = (a: string, b: string) => card(a).name.localeCompare(card(b).name);
  return tiers.flatMap((t) => t.sort(byName)).slice(0, max);
}

/** A Scryfall search result, just what the list needs. */
interface ScryHit {
  name: string;
  oracle_id?: string;
  type_line?: string;
  mana_cost?: string;
  card_faces?: { oracle_id?: string; type_line?: string; mana_cost?: string }[];
}

type DescribeState =
  | { kind: "idle" }
  | { kind: "busy"; what: string }
  | { kind: "error"; message: string }
  | { kind: "results"; query: string; cards: ScryHit[]; total: number; next?: string; more?: boolean };

/** Text that's already a Scryfall search ("t:creature c:wu", "o:flash mv<=2") goes straight to Scryfall. */
const SCRYFALL_SYNTAX = /(^|\s)-?[a-z]+(:|<=|>=|=|<|>)\S/i;

/**
 * Look up: one search box for any card in Magic.
 * - As you type: cards in the three cubes (and ones you added) come first and
 *   work offline; every other card comes from the card database, or Scryfall.
 * - Enter (or "Describe it"): plain English becomes a Scryfall query
 *   (api/card-search.ts), shown and editable, run against Scryfall. Text that's
 *   already Scryfall syntax skips that step. Needs a connection.
 */
export function LookUp() {
  const st = useReviewState();
  const { decisions, detail, setDetail } = st;
  const [q, setQ] = useState("");
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<DescribeState>({ kind: "idle" });
  const needle = q.trim().toLowerCase();
  // A described search stays up until the text changes.
  const describing = found.kind !== "idle";

  const local = useMemo(
    () => (needle.length < 2 ? [] : searchReviewCards(needle, 50)),
    // extrasVersion: a card you just added becomes a local result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [needle, st.extrasVersion],
  );
  const localSet = useMemo(() => new Set(local), [local]);

  const onType = (text: string) => {
    setQ(text);
    if (describing) {
      setFound({ kind: "idle" });
      setQuery("");
    }
  };

  /** Run a Scryfall query (or fetch its next page). */
  const runQuery = async (scryQuery: string, nextPage?: string) => {
    const prev = found.kind === "results" && nextPage ? found : null;
    if (prev) setFound({ ...prev, more: true });
    else setFound({ kind: "busy", what: "Searching Scryfall…" });
    try {
      const url = nextPage ?? `https://api.scryfall.com/cards/search?q=${encodeURIComponent(scryQuery)}&order=edhrec`;
      const res = await fetch(url);
      const j = (await res.json()) as { data?: ScryHit[]; total_cards?: number; next_page?: string; has_more?: boolean; details?: string };
      if (res.status === 404) return setFound({ kind: "results", query: scryQuery, cards: [], total: 0 });
      if (!res.ok) return setFound({ kind: "error", message: `Scryfall didn't understand that search: ${j.details ?? res.status}` });
      setFound({
        kind: "results",
        query: scryQuery,
        cards: [...(prev?.cards ?? []), ...(j.data ?? [])],
        total: j.total_cards ?? 0,
        next: j.has_more ? j.next_page : undefined,
      });
    } catch {
      setFound({ kind: "error", message: navigator.onLine ? "Scryfall didn't answer. Try again." : "Searching by description needs a connection." });
    }
  };

  const describe = async () => {
    const text = q.trim();
    if (!text || found.kind === "busy") return;
    if (SCRYFALL_SYNTAX.test(text)) {
      setQuery(text);
      return runQuery(text);
    }
    setFound({ kind: "busy", what: "Working out the search…" });
    try {
      const res = await fetch("/api/card-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = (await res.json().catch(() => ({}))) as { query?: string; error?: string };
      if (!res.ok || !j.query) return setFound({ kind: "error", message: j.error ?? `Couldn't search (HTTP ${res.status}).` });
      setQuery(j.query);
      await runQuery(j.query);
    } catch {
      setFound({ kind: "error", message: navigator.onLine ? "Couldn't reach the server. Try again." : "Searching by description needs a connection." });
    }
  };

  const openHit = (h: ScryHit) => {
    const id = h.oracle_id ?? h.card_faces?.[0]?.oracle_id;
    if (id && hasCard(id)) setDetail({ ids: [id], index: 0 });
    else void st.openFromScryfall(h.name).catch(() => setFound({ kind: "error", message: `Couldn't open ${h.name}.` }));
  };

  // Several words and no cube card matches: probably a description.
  const looksDescribed = needle.split(/\s+/).length >= 3 && local.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {st.saveFailed && (
        <p className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          This browser isn't saving your decisions (storage is blocked).
        </p>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void describe();
        }}
      >
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-(--color-text-dim)" />
          <input
            type="search"
            value={q}
            onChange={(e) => onType(e.target.value)}
            onFocus={st.preloadDb}
            placeholder="A card name, rules text, or describe it"
            aria-label="Search for a card"
            enterKeyHint="search"
            className="w-full rounded-lg border border-(--color-border) bg-(--color-bg-elev) py-3 pr-3 pl-10 text-base text-(--color-text) placeholder:text-(--color-text-dim)"
          />
        </div>
        {needle.length >= 2 && (
          <button
            type="submit"
            disabled={found.kind === "busy"}
            title="Search by what the card does (Enter)"
            className={`shrink-0 rounded-lg px-4 text-sm font-semibold disabled:opacity-40 ${
              looksDescribed && !describing
                ? "bg-(--color-accent) text-black hover:bg-(--color-accent-bright)"
                : "border border-(--color-border) text-(--color-text) hover:bg-white/5"
            }`}
          >
            Describe it
          </button>
        )}
      </form>

      {needle.length < 2 ? (
        <>
          <p className="text-sm text-(--color-text-dim)">
            Type a name to find any card in Magic, or describe one in your own words (“a blue-white creature with an enters
            ability”) and press Enter. Open a card to see its text, official rulings, which cubes have it, and your call on it.
          </p>
        </>
      ) : !describing ? (
        <>
          {local.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="px-1 text-xs font-medium text-(--color-text-dim)">
                In the cubes{local.length >= 50 ? " · first 50" : ` · ${local.length}`}
              </h3>
              <div className="divide-y divide-(--color-border) rounded-lg border border-(--color-border)">
                {local.map((id) => (
                  <Row
                    key={id}
                    c={card(id)}
                    log={null}
                    status={normalizeStatus(id, decisions[id]?.status)}
                    base={!!decisions[id]?.base}
                    selected={false}
                    onOpen={(cid) => setDetail({ ids: local, index: local.indexOf(cid) })}
                  />
                ))}
              </div>
            </section>
          )}
          <CardLookup q={q} exclude={localSet} db={st.cardDb} onOpenCard={st.openLookedUp} onScryfall={st.openFromScryfall} />
        </>
      ) : (
        <>
          <button type="button" onClick={() => onType(q)} className="px-1 text-sm text-(--color-accent) hover:underline">
            ← Back to name search
          </button>

          {found.kind === "busy" && (
            <p className="flex items-center gap-2 text-sm text-(--color-text-dim)">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-(--color-accent) border-t-transparent" />
              {found.what}
            </p>
          )}

          {query && found.kind !== "busy" && (
            <form
              className="space-y-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim()) void runQuery(query.trim());
              }}
            >
              <label className="block px-1 text-xs text-(--color-text-dim)" htmlFor="scryfall-query">
                Scryfall search — edit it and press Enter to refine
              </label>
              <input
                id="scryfall-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                spellCheck={false}
                className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 font-mono text-sm text-(--color-text)"
              />
            </form>
          )}

          {found.kind === "error" && <p className="text-sm text-amber-300">{found.message}</p>}

          {found.kind === "results" && (
            <section className="space-y-1.5">
              <h3 className="px-1 text-xs font-medium text-(--color-text-dim)">
                {found.total === 0
                  ? "No cards match. Loosen the search above."
                  : `${found.total} card${found.total === 1 ? "" : "s"}, most played first`}
              </h3>
              {found.cards.length > 0 && (
                <div className="divide-y divide-(--color-border) rounded-lg border border-(--color-border)">
                  {found.cards.map((h) => {
                    const id = h.oracle_id ?? h.card_faces?.[0]?.oracle_id ?? h.name;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => openHit(h)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-white/5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-(--color-text)">{h.name}</span>
                          <span className="block truncate text-xs text-(--color-text-dim)">
                            {h.type_line ?? h.card_faces?.map((f) => f.type_line).join(" // ")}
                          </span>
                        </span>
                        <span className="hidden shrink-0 sm:inline-flex">
                          <ManaCost cost={h.mana_cost ?? h.card_faces?.[0]?.mana_cost ?? ""} size={13} />
                        </span>
                        {hasCard(id) && cubeUnion.includes(id) && <MemberDots id={id} />}
                      </button>
                    );
                  })}
                </div>
              )}
              {found.next && (
                <button
                  type="button"
                  disabled={found.more}
                  onClick={() => void runQuery(found.query, found.next)}
                  className="w-full rounded-lg border border-(--color-border) py-2 text-sm text-(--color-text-dim) hover:bg-white/5 disabled:opacity-50"
                >
                  {found.more ? "Loading…" : `Show more (${found.total - found.cards.length} left)`}
                </button>
              )}
            </section>
          )}
        </>
      )}

      {detail && (
        <CardDetail
          ids={detail.ids}
          index={detail.index}
          decisions={decisions}
          live={st.live}
          artVersion={st.artVersion}
          onChooseArt={st.chooseArt}
          autoAdvance={autoAdvance}
          onAutoAdvance={setAutoAdvance}
          onIndex={(index) => setDetail((d) => (d ? { ...d, index } : d))}
          onStatus={st.setStatus}
          onNote={st.setNote}
          onBase={st.setBase}
          onTags={st.setTags}
          onOwned={st.setOwned}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- home page

/** My cube's size with every Cut and Add applied. */
function HeroCount({ live }: { live: Summary }) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-4">
      <div className="text-xs text-(--color-text-dim)">Your cube after your decisions</div>
      <div className="text-3xl font-semibold tabular-nums text-(--color-text)">{live.result} cards</div>
      <div className="mt-0.5 text-sm tabular-nums text-(--color-text-dim)">
        {live.current} now · <span className="text-red-300">{live.cuts.length} cut</span> ·{" "}
        <span className="text-emerald-300">{live.adds.length} added</span>
        {live.counts.maybe > 0 && <span className="text-amber-300"> · {live.counts.maybe} maybe</span>}
      </div>
    </div>
  );
}

function HomeGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 px-1 text-xs font-medium text-(--color-text-dim)">{title}</h3>
      <div className="divide-y divide-(--color-border) overflow-hidden rounded-xl border border-(--color-border) bg-(--color-bg-elev)">
        {children}
      </div>
    </section>
  );
}

function HomeRow({
  icon,
  label,
  sub,
  count,
  onClick,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-white/5">
      <Icon name={icon} className="h-5 w-5 shrink-0 text-(--color-text-dim)" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-(--color-text)">{label}</span>
        {sub && <span className="block truncate text-xs text-(--color-text-dim)">{sub}</span>}
      </span>
      {count !== undefined && (
        <span className="shrink-0 text-sm tabular-nums text-(--color-text-dim)">{count}</span>
      )}
      <Icon name="chevron" className="h-4 w-4 shrink-0 text-(--color-text-dim)" />
    </button>
  );
}

// ---------------------------------------------------------------- pieces

/**
 * My decisions splits into "in my cube - keep or cut?" and "new - add or not?"
 * sections (ids are already ordered that way); other views are one list.
 */
function sectionsFor(view: View, ids: string[], limit: number) {
  const shown = ids.slice(0, limit);
  if (view !== "decisions") return [{ key: "all", title: null as string | null, ids: shown, total: ids.length }];
  const mineTotal = ids.filter(inMyCube).length;
  return [
    { key: "mine", title: "In your cube — keep or cut?", ids: shown.filter(inMyCube), total: mineTotal },
    { key: "new", title: "Not in your cube — add or not?", ids: shown.filter((id) => !inMyCube(id)), total: ids.length - mineTotal },
  ].filter((sec) => sec.total > 0);
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <span className="inline-flex max-w-full overflow-x-auto rounded border border-(--color-border)">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={
            "shrink-0 px-2.5 py-1.5 text-xs whitespace-nowrap " +
            (value === v
              ? "bg-(--color-accent) font-medium text-black"
              : "text-(--color-text-dim) hover:bg-white/5")
          }
        >
          {label}
        </button>
      ))}
    </span>
  );
}

function FacetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-(--color-text-dim)">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-sm " +
        (on
          ? "border-(--color-accent) bg-(--color-accent)/20 text-(--color-text)"
          : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5")
      }
    >
      {children}
    </button>
  );
}

const COLOR_LABEL: Record<ColorFacet, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  M: "Multicolor",
  C: "Colorless",
};

function ColorChip({ facet, on, onClick }: { facet: ColorFacet; on: boolean; onClick: () => void }) {
  const uri = facet !== "M" && facet !== "C" ? SYMBOL_URI[facet] : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      title={COLOR_LABEL[facet]}
      aria-label={COLOR_LABEL[facet]}
      aria-pressed={on}
      className={
        "flex h-10 w-10 items-center justify-center rounded-full border-2 " +
        (on ? "border-(--color-accent)" : "border-transparent opacity-60 hover:opacity-100")
      }
    >
      {uri ? (
        <img src={uri} alt="" className="h-7 w-7" />
      ) : (
        <span className={"flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold " + PIP_STYLE[facet]}>
          {facet === "M" ? "" : "C"}
        </span>
      )}
    </button>
  );
}

function MemberDots({ id }: { id: string }) {
  return (
    <span className="inline-flex gap-0.5">
      {CUBE_KEYS.map((k) => {
        const has = members[k].has(id);
        return (
          <span
            key={k}
            title={`${has ? "In" : "Not in"} ${data.cubes[k].label}`}
            className={
              "flex h-4 w-4 items-center justify-center rounded text-[10px] font-semibold " +
              (has ? "bg-violet-500/35 text-violet-100" : "border border-(--color-border) text-(--color-text-dim)/60")
            }
          >
            {CUBE_SHORT[k]}
          </span>
        );
      })}
    </span>
  );
}

function BasePill() {
  return <span className="rounded bg-violet-500/35 px-1.5 py-0.5 text-[10px] font-semibold text-violet-100">Base</span>;
}

function StatusPill({ status }: { status?: Status }) {
  if (!status) return null;
  return (
    <span className={"rounded px-1.5 py-0.5 text-[10px] font-semibold " + STATUS_TONE[status]}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const Tile = memo(function Tile({
  c,
  src,
  status,
  base,
  hasNote,
  selected,
  onOpen,
}: {
  c: ReviewCard;
  src: string | null;
  status?: Status;
  base?: boolean;
  hasNote: boolean;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const grade = setGrade(c);
  return (
    <button
      type="button"
      data-card={c.id}
      onClick={() => onOpen(c.id)}
      className={
        "group relative flex flex-col rounded-lg border bg-(--color-bg-elev) p-1 text-left " +
        (selected ? "border-(--color-accent) ring-2 ring-(--color-accent)" : "border-(--color-border) hover:border-(--color-text-dim)")
      }
    >
      <div className="relative aspect-[488/680] w-full overflow-hidden rounded-[5%] bg-(--color-bg)">
        {src ? (
          <img
            src={src}
            alt={c.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            // Offline and this image isn't saved: show whichever printing is.
            onError={(e) => tryNextImage(e.currentTarget, fallbackImageUrls(c, "small"))}
          />
        ) : (
          <span className="flex h-full items-center justify-center p-2 text-center text-[11px] text-(--color-text-dim)">
            {c.name}
          </span>
        )}
        {(status || base) && (
          <span className="absolute top-1 right-1 flex gap-0.5">
            {base && <BasePill />}
            <StatusPill status={status} />
          </span>
        )}
        {grade && (
          <span className={"absolute bottom-1 left-1 rounded px-1 text-[10px] font-semibold " + gradeTone(grade === "SB" ? null : (grade as never))}>
            {grade}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-1 px-0.5">
        <span className="truncate text-[11px] text-(--color-text)">
          {hasNote && <span title="Has a note">✎ </span>}
          {frontName(c)}
        </span>
        <MemberDots id={c.id} />
      </div>
    </button>
  );
});

const Row = memo(function Row({
  c,
  log,
  status,
  base,
  selected,
  onOpen,
}: {
  c: ReviewCard;
  log: LogKey | null;
  status?: Status;
  base?: boolean;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const entry = log ? logById[log].get(c.id) : undefined;
  return (
    <button
      type="button"
      data-card={c.id}
      onClick={() => onOpen(c.id)}
      className={
        "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left text-sm sm:grid-cols-[minmax(0,2fr)_auto_minmax(0,2fr)_auto] " +
        (selected ? "bg-(--color-accent)/10" : "hover:bg-white/5")
      }
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-(--color-text)">{c.name}</span>
        <span className="hidden shrink-0 sm:inline-flex">
          <ManaCost cost={c.cost} size={13} />
        </span>
      </span>
      <span className="flex items-center justify-end gap-1.5">
        {entry && (
          <span
            className={
              "rounded px-1.5 py-0.5 text-[10px] font-semibold " +
              (entry.current ? "bg-emerald-500/20 text-emerald-200" : "border border-(--color-border) text-(--color-text-dim)")
            }
          >
            {entry.current ? "Current" : "Past"}
          </span>
        )}
        {base && <BasePill />}
        <StatusPill status={status} />
      </span>
      <span className="col-span-2 truncate text-xs text-(--color-text-dim) sm:col-span-1">
        {entry
          ? historyEvents(entry)
              .map((h) => `${h.kind === "add" ? "+" : "cut"} ${shortDate(h.date)}`)
              .join(" · ")
          : c.type}
      </span>
      <span className="col-span-2 sm:col-span-1">
        <MemberDots id={c.id} />
      </span>
    </button>
  );
});

/** Step an <img> through fallback URLs it hasn't tried yet. */
function tryNextImage(img: HTMLImageElement, candidates: (string | null)[]) {
  const tried = (img.dataset.tried ?? "").split("|");
  const next = candidates.find((u): u is string => !!u && u !== img.src && !tried.includes(u));
  if (next) {
    img.dataset.tried = [...tried, img.src].join("|");
    img.src = next;
  }
}

type PickState =
  | { kind: "loading" }
  | { kind: "list"; printings: Printing[] }
  | { kind: "error"; message: string };

/** Every printing of a card, oldest first; tap one to make it the default. Online only. */
function PrintingPicker({ c, onPick }: { c: ReviewCard; onPick: (p: Printing | null) => void }) {
  const [state, setState] = useState<PickState>({ kind: "loading" });
  const current = artChoice(c.id)?.sid;

  useEffect(() => {
    const ac = new AbortController();
    scryfallPrintings(c.id, ac.signal)
      .then((printings) => setState({ kind: "list", printings }))
      .catch(() => {
        if (!ac.signal.aborted)
          setState({
            kind: "error",
            message: navigator.onLine
              ? "Scryfall didn't respond — try again in a moment."
              : "Browsing printings needs a connection. Your current choice still shows offline once its image is saved.",
          });
      });
    return () => ac.abort();
  }, [c.id]);

  return (
    <div className="mt-2 rounded-lg border border-(--color-border) bg-(--color-bg) p-2">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-(--color-text-dim)">
        <span>
          {state.kind === "list" ? `${state.printings.length} printings, oldest first` : "Printings"}
        </span>
        {current && (
          <button type="button" onClick={() => onPick(null)} className="text-(--color-accent) hover:underline">
            Reset to default
          </button>
        )}
      </div>
      {state.kind === "loading" && <p className="text-sm text-(--color-text-dim)">Loading printings from Scryfall…</p>}
      {state.kind === "error" && <p className="text-sm text-(--color-text-dim)">{state.message}</p>}
      {state.kind === "list" && (
        <div className="grid max-h-96 grid-cols-3 gap-1.5 overflow-y-auto">
          {state.printings.map((p) => {
            const isCurrent = current ? p.sid === current : p.sid === c.img?.split("/").pop()?.split(".jpg")[0];
            return (
              <button
                key={p.sid}
                type="button"
                onClick={() => onPick(p)}
                className={
                  "rounded-lg border p-1 text-left " +
                  (isCurrent ? "border-(--color-accent) ring-2 ring-(--color-accent)" : "border-(--color-border) hover:border-(--color-text-dim)")
                }
              >
                <img
                  src={`https://cards.scryfall.io/small/front/${p.sid[0]}/${p.sid[1]}/${p.sid}.jpg`}
                  alt={`${c.name} — ${p.setName}`}
                  loading="lazy"
                  className="aspect-[488/680] w-full rounded-[5%] object-cover"
                />
                <span className="mt-0.5 block truncate text-[10px] text-(--color-text-dim)" title={p.setName}>
                  {p.set} · {p.released.slice(0, 4)}
                  {p.digital ? " · MTGO" : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- detail

function CardDetail({
  ids,
  index,
  decisions,
  live,
  artVersion,
  onChooseArt,
  autoAdvance,
  onAutoAdvance,
  onIndex,
  onStatus,
  onNote,
  onBase,
  onTags,
  onOwned,
  onClose,
}: {
  ids: string[];
  index: number;
  decisions: Decisions;
  live: Summary;
  artVersion: number;
  onChooseArt: (id: string, p: Printing | null) => void;
  autoAdvance: boolean;
  onAutoAdvance: (v: boolean) => void;
  onIndex: (i: number) => void;
  onStatus: (id: string, s: Status) => void;
  onNote: (id: string, note: string) => void;
  onBase: (id: string, on: boolean) => void;
  onTags: (id: string, tags: string[] | undefined) => void;
  onOwned: (id: string, on: boolean) => void;
  onClose: () => void;
}) {
  const c = card(ids[index]);
  const status = normalizeStatus(c.id, decisions[c.id]?.status);
  const base = !!decisions[c.id]?.base;
  const stepping = ids.length > 1;
  useBackToClose(onClose);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < ids.length) onIndex(next);
    },
    [index, ids.length, onIndex],
  );

  const tag = useCallback(
    (s: Status) => {
      onStatus(c.id, s);
      // Advance only when setting (not clearing) a status.
      if (autoAdvance && status !== s && index < ids.length - 1) onIndex(index + 1);
    },
    [c.id, onStatus, autoAdvance, status, index, ids.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
      if (e.key === "Escape") {
        if (typing) (t as HTMLElement).blur();
        else onClose();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (KEY_POLARITY[e.key.toLowerCase()]) tag(statusFor(c.id, KEY_POLARITY[e.key.toLowerCase()]));
      else if (e.key.toLowerCase() === "b" && inMyCube(c.id)) onBase(c.id, !base);
      else if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        document.getElementById("cube-review-note")?.focus();
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, tag, onClose, onBase, base, c.id]);

  return (
    // h-dvh, not inset-0: see Sheet.tsx (keeps the review bar over the bottom nav).
    <div
      className="fixed inset-x-0 top-0 z-50 flex h-dvh items-stretch justify-center bg-black/80 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-3xl flex-col overflow-hidden bg-(--color-bg-elev) sm:max-h-[92vh] sm:rounded-xl sm:border sm:border-(--color-border)"
        // Keeps the header below the phone's camera cutout (the page draws behind it: viewport-fit=cover).
        style={{ paddingTop: "env(safe-area-inset-top)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-(--color-border) px-3 py-2 text-xs text-(--color-text-dim)">
          <span>{stepping ? `${index + 1} / ${ids.length}` : ""}</span>
          <span className="text-(--color-text)" title={`${live.current} now − ${live.cuts.length} cut + ${live.adds.length} added`}>
            My cube <span className="font-semibold">{live.result}</span>
          </span>
          {stepping ? (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={autoAdvance} onChange={(e) => onAutoAdvance(e.target.checked)} />
              Next card after tagging
            </label>
          ) : (
            <span />
          )}
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-base hover:bg-white/10" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Keyed by card so the face and the note draft reset per card. */}
        <CardBody
          key={c.id}
          c={c}
          savedNote={decisions[c.id]?.note ?? ""}
          onNote={onNote}
          tags={cardTags(c.id, decisions)}
          tagsOverridden={!!decisions[c.id]?.tags}
          onTags={onTags}
          owned={owns(c.id, decisions)}
          ownedByHand={!!decisions[c.id]?.owned}
          onOwned={onOwned}
          artVersion={artVersion}
          onChooseArt={onChooseArt}
        />
        {/* Base cube: a card that would very unlikely be cut. Only for cards in my cube. */}
        {inMyCube(c.id) && (
          <button
            type="button"
            onClick={() => onBase(c.id, !base)}
            aria-pressed={base}
            className={
              "mx-4 mt-2 flex items-center justify-center gap-2 rounded-lg border py-1.5 text-xs font-medium " +
              (base ? "border-violet-400/60 bg-violet-500/25 text-violet-100" : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5")
            }
          >
            <Icon name="shield" className="h-4 w-4" />
            {base ? "Base cube · won't be cut" : "Mark as base cube"}
            <span className="ml-1 hidden text-(--color-text-dim) lg:inline">B</span>
          </button>
        )}
        {/* Review bar — big tap targets, pinned to the bottom on a phone. The arrows are 48px wide and the bar
            keeps them off the very edges (and above the gesture bar): taps there that drift a few pixels
            were being taken by Android's back-swipe and needed a second try. */}
        <div className="grid grid-cols-[3rem_repeat(3,minmax(0,1fr))_3rem] gap-1.5 border-t border-(--color-border) px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            className={ARROW}
            aria-label="Previous card"
          >
            <Icon name="back" className="h-6 w-6" />
          </button>
          {choicesFor(c.id).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => tag(s)}
              className={
                "rounded-lg border py-3 text-sm font-medium " +
                (status === s ? STATUS_BUTTON[s] : "border-(--color-border) text-(--color-text) hover:bg-white/5")
              }
            >
              {STATUS_LABEL[s]}
              <span className="ml-1 hidden text-xs text-(--color-text-dim) lg:inline">{STATUS_SHORTCUT[s]}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => go(1)}
            disabled={index === ids.length - 1}
            className={ARROW}
            aria-label="Next card"
          >
            <Icon name="chevron" className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A card's archetype tags as chips ("Lands · P"), with an editor: one row per
 * archetype, pick a role or none. Edited tags replace the suggested ones for
 * that card; "Back to suggested" drops the edit.
 */
function TagRow({
  tags,
  overridden,
  editing,
  onEdit,
  onTags,
}: {
  tags: string[];
  overridden: boolean;
  editing: boolean;
  onEdit: () => void;
  onTags: (tags: string[] | undefined) => void;
}) {
  const parsed = tags.map(parseTag).filter((t): t is { key: string; role: Role } => !!t);
  const roleOf = (key: string): Role | "" => parsed.find((t) => t.key === key)?.role ?? "";
  const set = (key: string, role: Role | "") => {
    const rest = parsed.filter((t) => t.key !== key).map((t) => `${t.key}:${t.role}`);
    onTags(role ? [...rest, `${key}:${role}`] : rest);
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-(--color-text)">Archetypes:</span>
        {parsed.length === 0 && <span>none</span>}
        {parsed.map((t) => (
          <span key={t.key} className="rounded-full bg-violet-500/25 px-2 py-0.5 text-[11px] text-violet-100" title={ROLE_LABEL[t.role]}>
            {ARCHETYPES.find((a) => a.key === t.key)?.label} · {t.role}
          </span>
        ))}
        <button type="button" onClick={onEdit} className="ml-1 rounded border border-(--color-border) px-2 py-0.5 text-[11px] hover:bg-white/5">
          {editing ? "Done" : "Edit"}
        </button>
        {overridden && !editing && <span className="text-[11px] text-(--color-accent)">edited</span>}
      </div>
      {editing && (
        <div className="mt-2 space-y-1 rounded border border-(--color-border) p-2">
          {ARCHETYPES.map((a) => (
            <div key={a.key} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-(--color-text)">{a.label}</span>
              <Segmented<Role | "">
                value={roleOf(a.key)}
                options={[["", "–"], ...ROLES.map((r): [Role, string] => [r, r])]}
                onChange={(v) => set(a.key, v)}
              />
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 text-[11px]">
            <span>P payoff · E enabler · F fits</span>
            {overridden && (
              <button type="button" onClick={() => onTags(undefined)} className="rounded border border-(--color-border) px-2 py-0.5 hover:bg-white/5">
                Back to suggested
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CardBody({
  c,
  savedNote,
  onNote,
  tags,
  tagsOverridden,
  onTags,
  owned,
  ownedByHand,
  onOwned,
  artVersion,
  onChooseArt,
}: {
  c: ReviewCard;
  savedNote: string;
  onNote: (id: string, note: string) => void;
  tags: string[];
  tagsOverridden: boolean;
  onTags: (id: string, tags: string[] | undefined) => void;
  owned: boolean;
  ownedByHand: boolean;
  onOwned: (id: string, on: boolean) => void;
  artVersion: number;
  onChooseArt: (id: string, p: Printing | null) => void;
}) {
  const [face, setFace] = useState<"front" | "back">("front");
  const [noteDraft, setNoteDraft] = useState(savedNote);
  const [editingTags, setEditingTags] = useState(false);
  const [picking, setPicking] = useState(false);
  const back = hasBackImage(c);
  const { me } = useAuth();

  // F flips double-faced cards.
  useEffect(() => {
    if (!back) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setFace((f) => (f === "front" ? "back" : "front"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  const big = imageUrl(c, "normal", face);
  const small = imageUrl(c, "small", face);
  const grade = setGrade(c);
  const faces = c.faces && c.faces.length > 1 ? c.faces : null;

  return (
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="grid gap-4 sm:grid-cols-[260px_minmax(0,1fr)]">
            <div className="mx-auto w-full max-w-[300px]">
              <div className="aspect-[488/680] overflow-hidden rounded-[4.5%] bg-(--color-bg)">
                {big && (
                  <img
                    key={`${big}|${artVersion}`}
                    src={big}
                    alt={c.name}
                    className="h-full w-full object-cover"
                    // Offline: try the saved small image, then the other printings it may have.
                    onError={(e) =>
                      tryNextImage(e.currentTarget, [small, ...fallbackImageUrls(c, "small", face)])
                    }
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => setPicking((v) => !v)}
                className="mt-2 w-full rounded border border-(--color-border) py-1.5 text-sm text-(--color-text-dim) hover:bg-white/5"
              >
                🎨 {picking ? "Close printings" : "Change printing"}
                {artChoice(c.id)?.label && <span className="ml-1 text-(--color-accent)">({artChoice(c.id)?.label})</span>}
              </button>
              {/* Right under the button, so the printings appear where you tapped. */}
              {picking && (
                <PrintingPicker
                  c={c}
                  onPick={(p) => {
                    onChooseArt(c.id, p);
                    setFace("front");
                    setPicking(false);
                  }}
                />
              )}
              {back && (
                <button
                  type="button"
                  onClick={() => setFace((f) => (f === "front" ? "back" : "front"))}
                  className="mt-2 w-full rounded border border-(--color-border) py-1.5 text-sm text-(--color-text-dim) hover:bg-white/5"
                >
                  ⟲ Show {face === "front" ? "back" : "front"} face <span className="hidden lg:inline">(F)</span>
                </button>
              )}
            </div>

            <div className="min-w-0 space-y-3 text-sm">
              {(faces ?? [{ name: c.name, cost: c.cost, type: c.type, text: c.text, pt: c.pt, loy: c.loy }]).map((f, i) => (
                <div key={i} className={i > 0 ? "border-t border-(--color-border) pt-3" : ""}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-(--color-text)">{f.name}</span>
                    {f.cost && <ManaCost cost={f.cost} />}
                  </div>
                  <div className="text-xs text-(--color-text-dim)">
                    {f.type}
                    {i === 0 && <> · {c.rarity}</>}
                    {f.pt && <> · {f.pt}</>}
                    {f.loy && <> · loyalty {f.loy}</>}
                  </div>
                  {f.text && (
                    <div className="mt-2 space-y-1 leading-relaxed text-(--color-text)">
                      {f.text.split("\n").map((line, j) => (
                        <p key={j}>{line}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="space-y-1 rounded border border-(--color-border) p-2 text-xs text-(--color-text-dim)">
                {CUBE_KEYS.map((k) => {
                  const entry = k === "mine" ? undefined : logById[k].get(c.id);
                  return (
                    <div key={k}>
                      <span className="text-(--color-text)">{data.cubes[k].label}:</span>{" "}
                      {members[k].has(c.id) ? "in" : "not in"}
                      {entry && (
                        <>
                          {" · "}
                          {historyEvents(entry)
                            .map((h) => `${h.kind === "add" ? "added" : "cut"} ${shortDate(h.date)}`)
                            .join(", ")}
                        </>
                      )}
                    </div>
                  );
                })}
                {grade && (
                  <div>
                    <span className="text-(--color-text)">Limited Resources:</span> {grade}
                  </div>
                )}
                {isExtra(c.id) && <div className="text-(--color-accent)">Added by hand</div>}
                <TagRow tags={tags} overridden={tagsOverridden} editing={editingTags} onEdit={() => setEditingTags((v) => !v)} onTags={(t) => onTags(c.id, t)} />
                {/* Owned: from the proxy orders, from the cube itself, or flagged by hand. */}
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-(--color-text)">Owned:</span>
                  {c.owned?.length ? <span>{c.owned.join(", ")}</span> : inMyCube(c.id) ? <span>in the cube</span> : <span>{ownedByHand ? "yes (marked by hand)" : "no"}</span>}
                  {!c.owned?.length && !inMyCube(c.id) && (
                    <button type="button" onClick={() => onOwned(c.id, !ownedByHand)} className="ml-1 rounded border border-(--color-border) px-2 py-0.5 text-[11px] hover:bg-white/5">
                      {ownedByHand ? "I don't have it" : "I have a copy"}
                    </button>
                  )}
                  {owned && !inMyCube(c.id) && <span className="text-[11px] text-(--color-text-dim)">· on the bench unless you add it</span>}
                </div>
                {isLookedUp(c.id) && (
                  <div className="text-(--color-accent)">Looked up — tag it or add a note to keep it on your list</div>
                )}
              </div>

              <Rulings sid={c.sid} oracleId={c.id} />

              {can(me, "judge") && (
                <button
                  type="button"
                  onClick={() => {
                    startQuestionAbout(c.name);
                    navigateTo("judge");
                  }}
                  className="w-full rounded-lg border border-(--color-accent)/60 py-2 text-sm text-(--color-text) hover:bg-(--color-accent)/10"
                >
                  Ask the judge about this card
                </button>
              )}

              <textarea
                id="cube-review-note"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onBlur={() => {
                  if (noteDraft !== savedNote) onNote(c.id, noteDraft.trim());
                }}
                placeholder="Note (E to type, Esc to leave)"
                rows={2}
                className="w-full rounded border border-(--color-border) bg-(--color-bg) px-2 py-1.5 text-sm text-(--color-text) placeholder:text-(--color-text-dim)"
              />
            </div>
          </div>
        </div>
  );
}

