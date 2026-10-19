import { useEffect, useRef, useState } from "react";
import {
  MAX_SEATS,
  MIN_SEATS,
  addDecks,
  deal,
  deleteDeck,
  listDecks,
  loadDecks,
  newDeckId,
  onRemoteDecks,
  renameDeck,
  saveDecks,
  setActive,
  type DeckMap,
} from "../lib/decks";
import { Icon } from "./Icon";

const SEATS_KEY = "booster-tutor-decks-seats";

function loadSeats(): number {
  try {
    const n = Number(localStorage.getItem(SEATS_KEY));
    return n >= MIN_SEATS && n <= MAX_SEATS ? n : MIN_SEATS;
  } catch {
    return MIN_SEATS;
  }
}

/** Random names to flick through while dealing (outside the component: it uses Math.random). */
function flicker(pool: string[], seats: number): string[] {
  return Array.from({ length: seats }, () => pool[Math.floor(Math.random() * pool.length)]);
}

/**
 * Deck randomizer: keep a list of your decks, pick how many players, and deal
 * each one a different random deck from the ones in the pool.
 */
export function DeckRandomizer() {
  const [map, setMap] = useState<DeckMap>(loadDecks);
  const [seats, setSeatsState] = useState(loadSeats);
  const [hands, setHands] = useState<string[] | null>(null);
  const [dealing, setDealing] = useState(false);
  const [adding, setAdding] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // Another device changed the list (owner sync): pick it up.
  useEffect(() => onRemoteDecks(() => setMap(loadDecks())), []);
  useEffect(() => () => window.clearInterval(timer.current), []);

  const change = (next: DeckMap) => {
    if (next === map) return;
    setMap(next);
    saveDecks(next);
  };
  const setSeats = (n: number) => {
    setSeatsState(n);
    setHands(null);
    try {
      localStorage.setItem(SEATS_KEY, String(n));
    } catch {
      // Just a remembered preference.
    }
  };

  const decks = listDecks(map);
  const pool = decks.filter((d) => d.active).map((d) => d.name);
  const short = pool.length < seats;

  const dealNow = () => {
    if (short || dealing) return;
    window.clearInterval(timer.current);
    const final = deal(pool, seats);
    let left = 10;
    setDealing(true);
    setHands(flicker(pool, seats));
    timer.current = window.setInterval(() => {
      left -= 1;
      if (left > 0) setHands(flicker(pool, seats));
      else {
        window.clearInterval(timer.current);
        setHands(final);
        setDealing(false);
      }
    }, 75);
  };

  const add = () => {
    const { map: next, added } = addDecks(map, adding, Date.now(), newDeckId);
    change(next);
    setAdding("");
    setNote(added ? `Added ${added} deck${added === 1 ? "" : "s"}.` : "Nothing new to add (those are already on the list).");
  };

  const chip = (on: boolean) =>
    "rounded-full border px-4 py-1.5 text-sm " +
    (on ? "border-(--color-accent) bg-(--color-accent)/15 text-(--color-text)" : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Dealing */}
      <section className="space-y-3 rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-(--color-text-dim)">Players</span>
          {Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, k) => k + MIN_SEATS).map((n) => (
            <button key={n} type="button" onClick={() => setSeats(n)} aria-pressed={seats === n} className={chip(seats === n)}>
              {n}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={dealNow}
          disabled={short || dealing}
          className="w-full rounded-xl bg-(--color-accent) px-4 py-4 text-base font-semibold text-black transition-colors hover:bg-(--color-accent-bright) disabled:cursor-not-allowed disabled:opacity-40"
        >
          {dealing ? "Dealing…" : hands ? "Deal again" : "Deal decks"}
        </button>
        {short && (
          <p className="text-sm text-(--color-text-dim)">
            {decks.length === 0
              ? "Add your decks below to start dealing."
              : `You need at least ${seats} decks in the pool for ${seats} players (${pool.length} now).`}
          </p>
        )}

        {hands && hands.length > 0 && (
          <div className={"grid gap-2 " + (seats > 2 ? "sm:grid-cols-2" : "")} aria-live="polite">
            {hands.map((name, i) => (
              <div key={i} className="rounded-lg border border-(--color-border) bg-(--color-bg) px-4 py-3">
                <div className="text-xs font-medium tracking-wide text-(--color-text-dim) uppercase">Player {i + 1}</div>
                <div className={"text-xl font-semibold text-(--color-text) " + (dealing ? "opacity-50" : "")}>{name}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* The list */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-(--color-text)">
          Your decks · {decks.length}
          {decks.length > 0 && <span className="text-(--color-text-dim)"> ({pool.length} in the pool)</span>}
        </h2>

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (adding.trim()) add();
          }}
        >
          <textarea
            value={adding}
            onChange={(e) => {
              setAdding(e.target.value);
              setNote(null);
            }}
            rows={3}
            placeholder={"Add decks, one per line\n(paste a whole list if you like)"}
            aria-label="Add decks, one per line"
            className="w-full resize-y rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-3 py-2 text-sm text-(--color-text) placeholder:text-(--color-text-dim)"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!adding.trim()}
              className="rounded-lg border border-(--color-border) px-4 py-2 text-sm text-(--color-text) hover:bg-white/5 disabled:opacity-40"
            >
              Add
            </button>
            {note && <span className="text-sm text-(--color-text-dim)">{note}</span>}
          </div>
        </form>

        {decks.length > 0 && (
          <ul className="divide-y divide-(--color-border) rounded-lg border border-(--color-border)">
            {decks.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  checked={d.active}
                  onChange={(e) => change(setActive(map, d.id, e.target.checked, Date.now()))}
                  aria-label={`${d.name} is in the pool`}
                  title="In the pool"
                  className="h-4.5 w-4.5 shrink-0 accent-(--color-accent)"
                />
                {editing?.id === d.id ? (
                  <form
                    className="flex min-w-0 flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      change(renameDeck(map, d.id, editing.name, Date.now()));
                      setEditing(null);
                    }}
                  >
                    <input
                      autoFocus
                      value={editing.name}
                      onChange={(e) => setEditing({ id: d.id, name: e.target.value })}
                      onBlur={() => {
                        change(renameDeck(map, d.id, editing.name, Date.now()));
                        setEditing(null);
                      }}
                      onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                      aria-label="Deck name"
                      className="min-w-0 flex-1 rounded border border-(--color-border) bg-(--color-bg) px-2 py-1 text-sm text-(--color-text)"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing({ id: d.id, name: d.name })}
                    title="Tap to rename"
                    className={"min-w-0 flex-1 truncate text-left text-sm " + (d.active ? "text-(--color-text)" : "text-(--color-text-dim) line-through")}
                  >
                    {d.name}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (confirmDelete === d.id) {
                      change(deleteDeck(map, d.id, Date.now()));
                      setConfirmDelete(null);
                    } else setConfirmDelete(d.id);
                  }}
                  onBlur={() => setConfirmDelete((c) => (c === d.id ? null : c))}
                  aria-label={confirmDelete === d.id ? `Tap again to delete ${d.name}` : `Delete ${d.name}`}
                  className={
                    "shrink-0 rounded px-2 py-1 text-xs " +
                    (confirmDelete === d.id ? "bg-red-500/15 text-red-300" : "text-(--color-text-dim) hover:bg-white/5")
                  }
                >
                  {confirmDelete === d.id ? "Delete?" : <Icon name="close" className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {decks.length > 0 && (
          <p className="text-xs text-(--color-text-dim)">Untick a deck to leave it out of dealing (lent out, being rebuilt). Tap a name to rename it.</p>
        )}
      </section>
    </div>
  );
}
