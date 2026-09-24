import { useMemo, useState } from "react";
import {
  COLOR_BUCKETS,
  colorBucket,
  gradeTone,
  hasAssessment,
  manaSymbols,
  primaryGrade,
  primaryValue,
  setReview,
  type ColorBucket,
  type SetReviewCard,
} from "../lib/set-review";
import manaSymbolUris from "../data/mana-symbols.json";
import { Modal } from "./Modal";
import { OfflinePanel } from "./OfflinePanel";

type SortKey = "grade" | "name" | "cmc" | "rarity";

/** Official Scryfall symbol artwork, inlined at build time so it works offline. */
const SYMBOL_URI = manaSymbolUris as Record<string, string>;

/** Fallback faces for anything without baked artwork (and the filter buttons). */
const PIP_STYLE: Record<string, string> = {
  W: "bg-[#f8f4e4] text-black",
  U: "bg-[#9fd5f2] text-black",
  B: "bg-[#b0a7a3] text-black",
  R: "bg-[#f4a08a] text-black",
  G: "bg-[#9ad3ae] text-black",
  // No real symbol exists for "multicolour" — gold is the convention.
  M: "bg-gradient-to-br from-[#e9d585] to-[#c1971f] text-black",
  C: "bg-[#cfc9c2] text-black",
};

function Pip({ sym }: { sym: string }) {
  const uri = SYMBOL_URI[sym];
  if (uri) {
    return (
      <img
        src={uri}
        alt={sym}
        title={sym}
        draggable={false}
        className="inline-block h-[15px] w-[15px] shrink-0 align-[-2px]"
      />
    );
  }
  // A symbol we haven't baked (e.g. from a newer set) still renders legibly.
  return (
    <span
      className={
        "inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[10px] font-semibold " +
        (PIP_STYLE[sym] ?? "bg-[#cfc9c2] text-black")
      }
    >
      {sym}
    </span>
  );
}

function ManaCost({ cost }: { cost: string }) {
  const syms = manaSymbols(cost);
  if (syms.length === 0) return <span className="text-(--color-text-dim)">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-0.5">
      {syms.map((s, i) => (
        <Pip key={i} sym={s} />
      ))}
    </span>
  );
}

/**
 * The shown grade: Luis's, or Marshall's when Luis didn't give one. The two
 * are close enough in practice that the table doesn't distinguish them; both
 * are still kept in the data.
 */
function GradePill({ card }: { card: SetReviewCard }) {
  const { grade } = primaryGrade(card);
  // "Sideboard" is a grade on its own, not a letter.
  const sideboardOnly = !grade && card.tag === "sideboard";
  return (
    <span className="inline-flex items-center gap-1">
      <span
        title={sideboardOnly ? "Graded as a sideboard card" : undefined}
        className={
          "inline-block min-w-[32px] rounded px-1.5 py-0.5 text-center text-sm font-semibold " +
          (sideboardOnly ? "bg-violet-500/20 text-violet-300" : gradeTone(grade))
        }
      >
        {grade ?? (sideboardOnly ? "SB" : "—")}
      </span>
    </span>
  );
}

function RarityBadge({ rarity }: { rarity: string }) {
  return (
    <span
      className={
        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase " +
        (rarity === "uncommon"
          ? "bg-slate-300/20 text-slate-200"
          : "bg-white/5 text-(--color-text-dim)")
      }
    >
      {rarity === "uncommon" ? "U" : "C"}
    </span>
  );
}

function RulesText({ text }: { text: string }) {
  if (!text) return <>—</>;
  return (
    <>
      {text.split("\n").map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </>
  );
}

/** Searchable, filterable set review. Table on desktop, card list on phones. */
export function SetReview() {
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState<"all" | "common" | "uncommon">("all");
  const [colors, setColors] = useState<Set<ColorBucket>>(new Set());
  const [gradedOnly, setGradedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("grade");
  const [asc, setAsc] = useState(false);
  /** Desktop hover preview. */
  const [hovered, setHovered] = useState<SetReviewCard | null>(null);
  /** Tapped/clicked card — opens the image modal (this is the phone path). */
  const [opened, setOpened] = useState<SetReviewCard | null>(null);

  const graded = useMemo(
    () => setReview.cards.filter((c) => hasAssessment(c)).length,
    [],
  );
  const imageUrls = useMemo(
    () => setReview.cards.map((c) => c.image_url).filter((u): u is string => !!u),
    [],
  );

  const toggleColor = (c: ColorBucket) =>
    setColors((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = setReview.cards.filter((c) => {
      if (rarity !== "all" && c.rarity !== rarity) return false;
      if (colors.size > 0 && !colors.has(colorBucket(c))) return false;
      if (gradedOnly && !hasAssessment(c)) return false;
      if (q) {
        const hay = `${c.name} ${c.type_line} ${c.oracle_text} ${c.note ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = asc ? 1 : -1;
    return filtered.sort((a, b) => {
      let d: number;
      switch (sortKey) {
        case "name":
          d = a.name.localeCompare(b.name);
          break;
        case "cmc":
          d = a.cmc - b.cmc;
          break;
        case "rarity":
          d = a.rarity.localeCompare(b.rarity);
          break;
        default:
          d = primaryValue(a) - primaryValue(b);
      }
      if (d === 0) d = a.name.localeCompare(b.name) * (asc ? 1 : -1);
      return d * dir;
    });
  }, [search, rarity, colors, gradedOnly, sortKey, asc]);

  const sortBtn = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => {
        if (sortKey === key) {
          setAsc((s) => !s);
        } else {
          setSortKey(key);
          setAsc(key === "name" || key === "cmc");
        }
      }}
      className={
        "flex items-center gap-1 text-left font-medium hover:text-(--color-text) " +
        (sortKey === key ? "text-(--color-accent)" : "text-(--color-text-dim)")
      }
    >
      {label}
      {sortKey === key && <span className="text-[10px]">{asc ? "▲" : "▼"}</span>}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium text-(--color-text)">
            {setReview.setName} — commons &amp; uncommons
          </h2>
          <p className="text-xs text-(--color-text-dim)">
            Grades from{" "}
            <a
              href={setReview.source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-(--color-accent) hover:underline"
            >
              {setReview.source.title}
            </a>
            , graded by Luis (or Marshall where Luis didn't give one). Card text
            via Scryfall.
          </p>
        </div>
        <span className="text-xs text-(--color-text-dim)">
          {graded} of {setReview.cards.length} graded
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-3 sm:gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, type, rules text…"
          className="w-full rounded border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) sm:w-56 sm:py-1.5"
        />

        <div className="inline-flex overflow-hidden rounded border border-(--color-border)">
          {(["all", "common", "uncommon"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRarity(r)}
              className={
                "px-3 py-2 text-xs capitalize sm:py-1.5 " +
                (rarity === r
                  ? "bg-(--color-accent) font-medium text-black"
                  : "text-(--color-text-dim) hover:bg-white/5")
              }
            >
              {r}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {COLOR_BUCKETS.map((c) => {
            const uri = SYMBOL_URI[c.id];
            return (
              <button
                key={c.id}
                type="button"
                title={c.label}
                aria-pressed={colors.has(c.id)}
                onClick={() => toggleColor(c.id)}
                className={
                  "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition sm:h-7 sm:w-7 " +
                  (colors.has(c.id)
                    ? "border-(--color-accent) ring-2 ring-(--color-accent)/40 "
                    : "border-(--color-border) opacity-70 hover:opacity-100 ") +
                  // The real symbols carry their own coloured disc.
                  (uri ? "bg-transparent" : (PIP_STYLE[c.id] ?? "bg-[#cfc9c2] text-black"))
                }
              >
                {uri ? <img src={uri} alt={c.label} className="h-5 w-5" /> : c.id}
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-xs text-(--color-text-dim)">
          <input
            type="checkbox"
            checked={gradedOnly}
            onChange={(e) => setGradedOnly(e.target.checked)}
          />
          Graded only
        </label>

        <span className="ml-auto text-xs text-(--color-text-dim)">{rows.length} shown</span>
      </div>

      <OfflinePanel urls={imageUrls} />

      {/* Mobile sort control — the table headers aren't reachable on a phone. */}
      <div className="flex items-center gap-2 md:hidden">
        <label className="text-xs text-(--color-text-dim)">Sort</label>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="flex-1 rounded border border-(--color-border) bg-(--color-bg) px-2 py-2 text-sm text-(--color-text)"
        >
          <option value="grade">Grade</option>
          <option value="name">Name</option>
          <option value="cmc">Mana value</option>
          <option value="rarity">Rarity</option>
        </select>
        <button
          type="button"
          onClick={() => setAsc((s) => !s)}
          className="rounded border border-(--color-border) px-3 py-2 text-sm text-(--color-text-dim)"
        >
          {asc ? "▲ Asc" : "▼ Desc"}
        </button>
      </div>

      {/* Phone layout: stacked cards, tap for the image */}
      <ul className="space-y-2 md:hidden">
        {rows.map((c) => (
          <li key={c.scryfall_id}>
            <button
              type="button"
              onClick={() => setOpened(c)}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-3 text-left active:bg-white/5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-(--color-text)">
                  {c.name}
                  {c.tag && (
                    <span className="ml-1.5 rounded bg-(--color-accent)/15 px-1 py-0.5 text-[10px] text-(--color-accent)">
                      {c.tag}
                    </span>
                  )}
                </span>
                <GradePill card={c} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-(--color-text-dim)">
                <ManaCost cost={c.mana_cost} />
                <span>{c.type_line}</span>
                {c.power && (
                  <span className="text-(--color-text)">
                    {c.power}/{c.toughness}
                  </span>
                )}
                <RarityBadge rarity={c.rarity} />
              </div>
              <div className="mt-2 text-xs leading-relaxed text-(--color-text-dim)">
                <RulesText text={c.oracle_text} />
              </div>
              {c.note && (
                <div className="mt-2 text-xs italic leading-relaxed text-(--color-text-dim)">
                  {c.note}
                </div>
              )}
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="rounded-lg border border-(--color-border) p-6 text-center text-(--color-text-dim)">
            No cards match those filters.
          </li>
        )}
      </ul>

      {/* Desktop layout: table */}
      <div className="hidden overflow-x-auto rounded-lg border border-(--color-border) md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-black/30 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">{sortBtn("name", "Card")}</th>
              <th className="px-3 py-2 text-left">{sortBtn("cmc", "Cost")}</th>
              <th className="px-3 py-2 text-left font-medium text-(--color-text-dim)">Type</th>
              <th className="px-3 py-2 text-left font-medium text-(--color-text-dim)">
                Rules text
              </th>
              <th className="px-3 py-2 text-left">{sortBtn("rarity", "Rar.")}</th>
              <th className="px-3 py-2 text-left">{sortBtn("grade", "Grade")}</th>
              <th className="px-3 py-2 text-left font-medium text-(--color-text-dim)">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.scryfall_id}
                className="border-t border-(--color-border) align-top hover:bg-white/[0.03]"
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpened(c)}
                    onMouseEnter={() => setHovered(c)}
                    onMouseLeave={() => setHovered(null)}
                    className="text-left font-medium text-(--color-text) hover:text-(--color-accent)"
                  >
                    {c.name}
                  </button>
                  {c.tag && (
                    <span className="ml-1.5 rounded bg-(--color-accent)/15 px-1 py-0.5 text-[10px] text-(--color-accent)">
                      {c.tag}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <ManaCost cost={c.mana_cost} />
                </td>
                <td className="px-3 py-2 text-xs text-(--color-text-dim)">
                  {c.type_line}
                  {c.power && (
                    <span className="ml-1 text-(--color-text)">
                      {c.power}/{c.toughness}
                    </span>
                  )}
                </td>
                <td className="max-w-[360px] px-3 py-2 text-xs leading-relaxed text-(--color-text-dim)">
                  <RulesText text={c.oracle_text} />
                </td>
                <td className="px-3 py-2">
                  <RarityBadge rarity={c.rarity} />
                </td>
                <td className="px-3 py-2">
                  <GradePill card={c} />
                </td>
                <td className="max-w-[300px] px-3 py-2 text-xs italic leading-relaxed text-(--color-text-dim)">
                  {c.note ?? ""}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-(--color-text-dim)">
                  No cards match those filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Desktop hover preview (suppressed while the modal is up) */}
      {hovered?.image_url && !opened && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-40 hidden w-[240px] overflow-hidden rounded-xl border-2 border-(--color-accent) shadow-2xl lg:block">
          <img src={hovered.image_url} alt={hovered.name} className="w-full" />
        </div>
      )}

      {/* Tap / click preview — the phone path */}
      {opened && (
        <Modal onClose={() => setOpened(null)}>
          <div className="flex flex-col items-center gap-3">
            {opened.image_url ? (
              <img
                src={opened.image_url}
                alt={opened.name}
                className="w-full max-w-[300px] rounded-xl border border-(--color-border)"
              />
            ) : (
              <div className="w-full max-w-[300px] rounded-xl border border-(--color-border) p-6 text-center text-(--color-text-dim)">
                {opened.name}
              </div>
            )}
            <div className="w-full text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="font-medium text-(--color-text)">{opened.name}</span>
                <GradePill card={opened} />
              </div>
              {opened.note && (
                <p className="mt-2 text-xs italic leading-relaxed text-(--color-text-dim)">
                  {opened.note}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpened(null)}
              className="w-full rounded-lg border border-(--color-border) px-4 py-2.5 text-sm text-(--color-text-dim) hover:bg-white/5"
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
