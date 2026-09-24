import { useMemo, useState } from "react";
import {
  COLOR_BUCKETS,
  colorBucket,
  consensus,
  gradeTone,
  gradeValue,
  manaSymbols,
  setReview,
  type ColorBucket,
  type Grade,
  type SetReviewCard,
} from "../lib/set-review";

type SortKey = "consensus" | "name" | "cmc" | "marshall" | "luis" | "rarity";

const PIP_STYLE: Record<string, string> = {
  W: "bg-[#f8f4e4] text-black",
  U: "bg-[#9fd5f2] text-black",
  B: "bg-[#b0a7a3] text-black",
  R: "bg-[#f4a08a] text-black",
  G: "bg-[#9ad3ae] text-black",
};

function Pip({ sym }: { sym: string }) {
  const style = PIP_STYLE[sym] ?? "bg-[#cfc9c2] text-black";
  return (
    <span
      className={
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold " +
        style
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

function GradePill({ grade }: { grade: Grade | null }) {
  return (
    <span
      className={
        "inline-block min-w-[30px] rounded px-1.5 py-0.5 text-center text-xs font-semibold " +
        gradeTone(grade)
      }
    >
      {grade ?? "—"}
    </span>
  );
}

/** Searchable, filterable table of a podcast set review. */
export function SetReview() {
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState<"all" | "common" | "uncommon">("all");
  const [colors, setColors] = useState<Set<ColorBucket>>(new Set());
  const [gradedOnly, setGradedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("consensus");
  const [asc, setAsc] = useState(false);
  const [preview, setPreview] = useState<SetReviewCard | null>(null);

  const graded = useMemo(
    () => setReview.cards.filter((c) => c.marshall || c.luis).length,
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
      if (gradedOnly && !c.marshall && !c.luis) return false;
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
        case "marshall":
          d = gradeValue(a.marshall) - gradeValue(b.marshall);
          break;
        case "luis":
          d = gradeValue(a.luis) - gradeValue(b.luis);
          break;
        case "rarity":
          d = a.rarity.localeCompare(b.rarity);
          break;
        default:
          d = consensus(a) - consensus(b);
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
            . Card text via Scryfall.
          </p>
        </div>
        <span className="text-xs text-(--color-text-dim)">
          {graded} of {setReview.cards.length} cards graded
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, type, rules text…"
          className="w-56 rounded border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text)"
        />

        <div className="inline-flex overflow-hidden rounded border border-(--color-border)">
          {(["all", "common", "uncommon"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRarity(r)}
              className={
                "px-2.5 py-1.5 text-xs capitalize " +
                (rarity === r
                  ? "bg-(--color-accent) font-medium text-black"
                  : "text-(--color-text-dim) hover:bg-white/5")
              }
            >
              {r}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {COLOR_BUCKETS.map((c) => (
            <button
              key={c.id}
              type="button"
              title={c.label}
              onClick={() => toggleColor(c.id)}
              className={
                "h-7 w-7 rounded-full border text-xs font-semibold transition " +
                (colors.has(c.id)
                  ? "border-(--color-accent) ring-2 ring-(--color-accent)/40 "
                  : "border-(--color-border) opacity-70 hover:opacity-100 ") +
                (PIP_STYLE[c.id] ?? "bg-[#cfc9c2] text-black")
              }
            >
              {c.id}
            </button>
          ))}
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

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-(--color-border)">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="bg-black/30 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">{sortBtn("name", "Card")}</th>
              <th className="px-3 py-2 text-left">{sortBtn("cmc", "Cost")}</th>
              <th className="px-3 py-2 text-left font-medium text-(--color-text-dim)">Type</th>
              <th className="px-3 py-2 text-left font-medium text-(--color-text-dim)">
                Rules text
              </th>
              <th className="px-3 py-2 text-left">{sortBtn("rarity", "Rar.")}</th>
              <th className="px-3 py-2 text-left">{sortBtn("marshall", "Marshall")}</th>
              <th className="px-3 py-2 text-left">{sortBtn("luis", "Luis")}</th>
              <th className="px-3 py-2 text-left font-medium text-(--color-text-dim)">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.scryfall_id}
                className="border-t border-(--color-border) align-top hover:bg-white/[0.03]"
              >
                <td
                  className="px-3 py-2 font-medium text-(--color-text)"
                  onMouseEnter={() => setPreview(c)}
                  onMouseLeave={() => setPreview(null)}
                >
                  {c.name}
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
                  {c.oracle_text
                    ? c.oracle_text.split("\n").map((line, i) => <div key={i}>{line}</div>)
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase " +
                      (c.rarity === "uncommon"
                        ? "bg-slate-300/20 text-slate-200"
                        : "bg-white/5 text-(--color-text-dim)")
                    }
                  >
                    {c.rarity === "uncommon" ? "U" : "C"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <GradePill grade={c.marshall} />
                </td>
                <td className="px-3 py-2">
                  <GradePill grade={c.luis} />
                </td>
                <td className="max-w-[300px] px-3 py-2 text-xs italic leading-relaxed text-(--color-text-dim)">
                  {c.note ?? ""}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-(--color-text-dim)">
                  No cards match those filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Hover preview */}
      {preview?.image_url && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-40 hidden w-[240px] overflow-hidden rounded-xl border-2 border-(--color-accent) shadow-2xl lg:block">
          <img src={preview.image_url} alt={preview.name} className="w-full" />
        </div>
      )}
    </div>
  );
}
