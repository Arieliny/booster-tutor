import { useMemo, useState } from "react";
import manaSymbolUris from "../data/mana-symbols.json";
import {
  COLOR_BUCKETS,
  colorBucket,
  hasAssessment,
  manaSymbols,
  primaryGrade,
  setReview,
  type ColorBucket,
  type SetReviewCard,
} from "../lib/set-review";

const SYMBOL_URI = manaSymbolUris as Record<string, string>;

/** Section accents, kept subtle so they survive black-and-white printing. */
const SECTION_RULE: Record<ColorBucket, string> = {
  W: "#c9c2a6",
  U: "#6fa8c9",
  B: "#7b7370",
  R: "#c97a62",
  G: "#6fa583",
  M: "#c1971f",
  C: "#9aa0a8",
};

function Cost({ cost }: { cost: string }) {
  // Split/adventure cards carry both faces ("{3}{W} // {G/W}"). We show the
  // front-face name, so show the front-face cost to match.
  const syms = manaSymbols(cost.split(" // ")[0]);
  if (syms.length === 0) return null;
  return (
    <span className="ml-1 inline-flex shrink-0 gap-px align-[-1px]">
      {syms.map((s, i) =>
        SYMBOL_URI[s] ? (
          <img key={i} src={SYMBOL_URI[s]} alt={s} className="h-[11px] w-[11px]" />
        ) : (
          <span key={i} className="text-[10px]">
            {`{${s}}`}
          </span>
        ),
      )}
    </span>
  );
}

/**
 * Condensed reference for use at a draft table: no rules text or images, just
 * grade, name, cost and the note, grouped by colour and ordered by mana value.
 * Designed to be printed — see the @media print block in index.css.
 */
export function SetReviewPrint({ onBack }: { onBack: () => void }) {
  const [showNotes, setShowNotes] = useState(true);
  const [gradedOnly, setGradedOnly] = useState(true);

  const sections = useMemo(() => {
    return COLOR_BUCKETS.map((bucket) => {
      const cards = setReview.cards
        .filter((c) => colorBucket(c) === bucket.id)
        .filter((c) => (gradedOnly ? hasAssessment(c) : true))
        .sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));
      return { ...bucket, cards };
    }).filter((s) => s.cards.length > 0);
  }, [gradedOnly]);

  const total = sections.reduce((n, s) => n + s.cards.length, 0);

  return (
    <div className="space-y-4">
      {/* Screen-only controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-3 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="rounded border border-(--color-border) px-3 py-1.5 text-sm text-(--color-text-dim) hover:bg-white/5"
        >
          ← Full table
        </button>
        <label className="flex items-center gap-2 text-xs text-(--color-text-dim)">
          <input
            type="checkbox"
            checked={showNotes}
            onChange={(e) => setShowNotes(e.target.checked)}
          />
          Comments
        </label>
        <label className="flex items-center gap-2 text-xs text-(--color-text-dim)">
          <input
            type="checkbox"
            checked={gradedOnly}
            onChange={(e) => setGradedOnly(e.target.checked)}
          />
          Graded only
        </label>
        <span className="text-xs text-(--color-text-dim)">{total} cards</span>
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto rounded bg-(--color-accent) px-4 py-1.5 text-sm font-medium text-black hover:bg-(--color-accent-bright)"
        >
          Print
        </button>
      </div>

      {/* Title block — prints once at the top */}
      <div className="border-b border-(--color-border) pb-2">
        <h2 className="text-base font-semibold text-(--color-text)">
          {setReview.setName} — commons &amp; uncommons
        </h2>
        <p className="text-[10px] text-(--color-text-dim)">
          Grades from {setReview.source.title}. Within each colour, ordered by
          mana value.
        </p>
      </div>

      {/* Two columns on paper; one on screen so it stays readable. */}
      <div className="print:columns-2 print:gap-6">
        {sections.map((section) => (
          <section key={section.id} className="mb-3 break-inside-avoid">
            <h3
              className="mb-1 border-b-2 pb-0.5 text-[11px] font-bold uppercase tracking-wider text-(--color-text)"
              style={{ borderColor: SECTION_RULE[section.id] }}
            >
              {section.label}
              <span className="ml-1.5 font-normal text-(--color-text-dim)">
                {section.cards.length}
              </span>
            </h3>
            <ul>
              {section.cards.map((card) => (
                <Entry key={card.scryfall_id} card={card} showNote={showNotes} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Entry({ card, showNote }: { card: SetReviewCard; showNote: boolean }) {
  const { grade } = primaryGrade(card);
  const label = grade ?? (card.tag === "sideboard" ? "SB" : "—");
  return (
    <li className="break-inside-avoid py-[1px] text-[11px] leading-snug">
      <div className="flex items-baseline gap-1.5">
        <span className="w-[26px] shrink-0 text-right font-bold tabular-nums text-(--color-text)">
          {label}
        </span>
        <span className="min-w-0 text-(--color-text)">
          <span className="font-medium">{card.name.split(" // ")[0]}</span>
          <Cost cost={card.mana_cost} />
          {card.tag === "build-around" && (
            <span className="ml-1 text-[9px] uppercase text-(--color-text-dim)">
              build-around
            </span>
          )}
        </span>
      </div>
      {showNote && card.note && (
        <div className="ml-[32px] text-[10px] italic leading-tight text-(--color-text-dim)">
          {card.note}
        </div>
      )}
    </li>
  );
}
