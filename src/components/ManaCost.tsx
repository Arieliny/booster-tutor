import { PIP_STYLE, SYMBOL_URI, manaSymbols } from "../lib/mana";

export function Pip({ sym, size = 15 }: { sym: string; size?: number }) {
  const uri = SYMBOL_URI[sym];
  if (uri) {
    return (
      <img
        src={uri}
        alt={sym}
        title={sym}
        draggable={false}
        style={{ width: size, height: size }}
        className="inline-block shrink-0 align-[-2px]"
      />
    );
  }
  // A symbol we haven't baked (e.g. from a newer set) still renders legibly.
  return (
    <span
      style={{ height: size, minWidth: size }}
      className={
        "inline-flex items-center justify-center rounded-full px-1 text-[10px] font-semibold " +
        (PIP_STYLE[sym] ?? "bg-[#cfc9c2] text-black")
      }
    >
      {sym}
    </span>
  );
}

/** A mana cost as pips. Multi-face costs ("{1}{U} // {3}{B}") keep their separator. */
export function ManaCost({ cost, size }: { cost: string; size?: number }) {
  if (!cost) return <span className="text-(--color-text-dim)">—</span>;
  const parts = cost.split(" // ");
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5">
      {parts.map((part, p) => (
        <span key={p} className="inline-flex items-center gap-0.5">
          {p > 0 && <span className="mx-0.5 text-(--color-text-dim)">//</span>}
          {manaSymbols(part).map((s, i) => (
            <Pip key={i} sym={s} size={size} />
          ))}
        </span>
      ))}
    </span>
  );
}
