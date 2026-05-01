import { useEffect, useMemo, useState } from "react";
import type { Cube } from "../types";
import { loadInventory, saveInventory } from "../lib/cube-store";

interface Props {
  cube: Cube;
}

type Filter = "all" | "received" | "missing";

export function Inventory({ cube }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loaded, setLoaded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Reload when the active cube changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoaded(false);
      const ids = await loadInventory(cube.id);
      if (cancelled) return;
      setChecked(new Set(ids));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [cube.id]);

  const sorted = useMemo(
    () => [...cube.cards].sort((a, b) => a.name.localeCompare(b.name)),
    [cube.cards],
  );

  const filtered = useMemo(() => {
    let result = sorted;
    if (filter === "received") {
      result = result.filter((c) => checked.has(c.scryfall_id));
    } else if (filter === "missing") {
      result = result.filter((c) => !checked.has(c.scryfall_id));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }
    return result;
  }, [sorted, filter, search, checked]);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Fire-and-forget persist. Latest write wins, which is what we want.
      void saveInventory(cube.id, Array.from(next));
      return next;
    });
  };

  const markAll = async () => {
    const all = cube.cards.map((c) => c.scryfall_id);
    setChecked(new Set(all));
    await saveInventory(cube.id, all);
  };

  const clearAll = async () => {
    setChecked(new Set());
    await saveInventory(cube.id, []);
    setConfirmClear(false);
  };

  if (!loaded) {
    return (
      <div className="py-8 text-center text-sm text-(--color-text-dim)">Loading…</div>
    );
  }

  const totalReceived = checked.size;
  const totalCards = cube.cards.length;
  const pct = totalCards === 0 ? 0 : Math.round((totalReceived / totalCards) * 100);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-(--color-border) bg-black/30 p-4">
        <div className="mb-2 flex items-end justify-between gap-2">
          <div>
            <div className="text-2xl font-semibold text-(--color-text)">
              {totalReceived} <span className="text-(--color-text-dim)">/ {totalCards}</span>
            </div>
            <div className="text-xs text-(--color-text-dim)">received ({pct}%)</div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={markAll}
              disabled={totalReceived === totalCards}
              className="rounded border border-(--color-border) px-3 py-1.5 text-xs text-(--color-text-dim) hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark all
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={totalReceived === 0}
              className="rounded border border-(--color-border) px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear all
            </button>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-(--color-bg)">
          <div
            className="h-full bg-(--color-accent) transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cards…"
          className="min-w-[180px] flex-1 rounded border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text) placeholder:text-(--color-text-dim)"
        />
        <div
          role="radiogroup"
          aria-label="Filter"
          className="inline-flex overflow-hidden rounded border border-(--color-border) bg-(--color-bg-elev)"
        >
          {(["all", "missing", "received"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={
                "px-3 py-1.5 text-xs capitalize transition-colors " +
                (filter === f
                  ? "bg-(--color-accent) text-black font-medium"
                  : "text-(--color-text-dim) hover:bg-white/5")
              }
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-(--color-text-dim)">
          No cards match.
        </p>
      ) : (
        <ul className="space-y-1">
          {filtered.map((card) => {
            const isChecked = checked.has(card.scryfall_id);
            return (
              <li key={card.scryfall_id}>
                <button
                  type="button"
                  onClick={() => toggle(card.scryfall_id)}
                  className={
                    "flex w-full items-center gap-3 rounded border p-2 text-left transition-colors " +
                    (isChecked
                      ? "border-(--color-accent)/40 bg-(--color-accent)/5"
                      : "border-(--color-border) hover:bg-white/5")
                  }
                >
                  <span
                    aria-hidden
                    className={
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 " +
                      (isChecked
                        ? "border-(--color-accent) bg-(--color-accent) text-black"
                        : "border-(--color-border)")
                    }
                  >
                    {isChecked && (
                      <svg
                        viewBox="0 0 16 16"
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      >
                        <path d="M3 8.5l3.5 3.5L13 4" />
                      </svg>
                    )}
                  </span>
                  {card.image_url ? (
                    <img
                      src={card.image_url}
                      alt=""
                      loading="lazy"
                      className="h-12 w-9 shrink-0 rounded-sm object-cover"
                    />
                  ) : (
                    <div className="h-12 w-9 shrink-0 rounded-sm bg-(--color-bg-elev)" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div
                      className={
                        "truncate text-sm " +
                        (isChecked ? "text-(--color-text)" : "text-(--color-text)")
                      }
                    >
                      {card.name}
                    </div>
                    <div className="truncate text-xs text-(--color-text-dim)">
                      {card.set ? card.set.toUpperCase() : "—"}
                      {card.collector_number ? ` · ${card.collector_number}` : ""}
                      {card.type_line ? ` · ${card.type_line}` : ""}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {confirmClear && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setConfirmClear(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-medium text-(--color-text)">
              Clear all received marks?
            </h2>
            <p className="mb-4 text-(--color-text-dim)">
              This will uncheck all {totalReceived} cards in{" "}
              <span className="text-(--color-text)">{cube.name}</span>'s inventory.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded border border-(--color-border) px-4 py-2 text-sm text-(--color-text-dim) hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="rounded bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
