import { useState } from "react";
import { useRulings } from "../lib/rulings";

const SHOW = 3;

/** "Official rulings" for a card, newest first, the first few shown. */
export function Rulings({ sid, oracleId }: { sid: string | undefined; oracleId: string }) {
  const state = useRulings(sid, oracleId);
  const [all, setAll] = useState(false);

  if (state.kind === "loading") return <p className="text-xs text-(--color-text-dim)">Loading official rulings…</p>;
  if (state.kind === "unavailable")
    return (
      <p className="text-xs text-(--color-text-dim)">
        {state.offline ? "Rulings need a connection the first time you open a card." : "Couldn't load rulings from Scryfall."}
      </p>
    );

  const list = [...state.rulings].reverse();
  if (!list.length) return <p className="text-xs text-(--color-text-dim)">No official rulings for this card.</p>;
  const shown = all ? list : list.slice(0, SHOW);

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-(--color-text-dim)">Official rulings · {list.length}</div>
      <ul className="space-y-1.5">
        {shown.map((r, i) => (
          <li key={i} className="rounded border border-(--color-border) px-2 py-1.5 text-xs leading-relaxed text-(--color-text)">
            <span className="mr-1.5 text-(--color-text-dim)">{r.date}</span>
            {r.text}
          </li>
        ))}
      </ul>
      {list.length > SHOW && (
        <button type="button" onClick={() => setAll((a) => !a)} className="text-xs text-(--color-accent) hover:underline">
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </div>
  );
}
