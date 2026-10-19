import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_LIST,
  MAX_SEATS,
  MIN_SEATS,
  addDecks,
  addList,
  deal,
  deleteDeck,
  deleteList,
  listDecks,
  listLists,
  loadDecks,
  loadLists,
  newDeckId,
  onRemoteDecks,
  renameDeck,
  renameList,
  saveDecks,
  saveLists,
  setActive,
  type DeckMap,
  type ListMap,
} from "../lib/decks";
import { Icon } from "./Icon";

const SEATS_KEY = "booster-tutor-decks-seats";
const LIST_KEY = "booster-tutor-decks-list";

function loadSeats(): number {
  try {
    const n = Number(localStorage.getItem(SEATS_KEY));
    return n >= MIN_SEATS && n <= MAX_SEATS ? n : MIN_SEATS;
  } catch {
    return MIN_SEATS;
  }
}

function loadListChoice(): string {
  try {
    return localStorage.getItem(LIST_KEY) ?? DEFAULT_LIST;
  } catch {
    return DEFAULT_LIST;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Just a remembered preference.
  }
}

/** Edit time for list/deck changes (outside the component: it reads the clock). */
const now = () => Date.now();

/** Random names to flick through while dealing (outside the component: it uses Math.random). */
function flicker(pool: string[], seats: number): string[] {
  return Array.from({ length: seats }, () => pool[Math.floor(Math.random() * pool.length)]);
}

/**
 * Deck randomizer: keep deck lists ("Commander", "Pauper cube", ...), pick a
 * list and how many players, and deal each one a different random deck from
 * the ones in that list's pool.
 */
export function DeckRandomizer() {
  const [map, setMap] = useState<DeckMap>(loadDecks);
  const [lists, setLists] = useState<ListMap>(loadLists);
  const [chosen, setChosen] = useState(loadListChoice);
  const [seats, setSeatsState] = useState(loadSeats);
  const [hands, setHands] = useState<string[] | null>(null);
  const [dealing, setDealing] = useState(false);
  const [adding, setAdding] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Naming a new list, renaming this one, or confirming its deletion.
  const [listEdit, setListEdit] = useState<{ kind: "new" | "rename"; name: string } | { kind: "delete" } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // Another device changed decks or lists (owner sync): pick them up.
  useEffect(
    () =>
      onRemoteDecks(() => {
        setMap(loadDecks());
        setLists(loadLists());
      }),
    [],
  );
  useEffect(() => () => window.clearInterval(timer.current), []);

  const allLists = listLists(lists);
  // The chosen list, or the first one if it's gone (deleted here or on another device).
  const list = allLists.find((l) => l.id === chosen) ?? allLists[0];

  const changeDecks = (next: DeckMap) => {
    if (next === map) return;
    setMap(next);
    saveDecks(next);
  };
  const changeLists = (next: ListMap) => {
    if (next === lists) return;
    setLists(next);
    saveLists(next);
  };
  const choose = (id: string) => {
    setChosen(id);
    remember(LIST_KEY, id);
    setHands(null);
    setNote(null);
    setListEdit(null);
  };
  const setSeats = (n: number) => {
    setSeatsState(n);
    setHands(null);
    remember(SEATS_KEY, String(n));
  };

  const decks = listDecks(map, list.id);
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
    const { map: next, added } = addDecks(map, adding, now(), newDeckId, list.id);
    changeDecks(next);
    setAdding("");
    setNote(added ? `Added ${added} deck${added === 1 ? "" : "s"} to ${list.name}.` : "Nothing new to add (those are already in this list).");
  };

  const saveListEdit = () => {
    if (!listEdit || listEdit.kind === "delete") return;
    if (listEdit.kind === "new") {
      const made = addList(lists, listEdit.name, now(), newDeckId);
      if (!made.id) return setNote(listEdit.name.trim() ? "There's already a list with that name." : null);
      changeLists(made.lists);
      choose(made.id);
    } else {
      changeLists(renameList(lists, list.id, listEdit.name, now()));
      setListEdit(null);
    }
  };

  const chip = (on: boolean) =>
    "shrink-0 rounded-full border px-4 py-1.5 text-sm " +
    (on ? "border-(--color-accent) bg-(--color-accent)/15 text-(--color-text)" : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Which list */}
      <section className="space-y-2">
        <div className="text-xs font-medium tracking-wide text-(--color-text-dim) uppercase">Deck list</div>
        <div className="flex flex-wrap gap-1.5">
          {allLists.map((l) => (
            <button key={l.id} type="button" onClick={() => choose(l.id)} aria-pressed={l.id === list.id} className={chip(l.id === list.id)}>
              {l.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setListEdit({ kind: "new", name: "" })}
            className="shrink-0 rounded-full border border-dashed border-(--color-border) px-4 py-1.5 text-sm text-(--color-text-dim) hover:bg-white/5 hover:text-(--color-text)"
          >
            + New list
          </button>
        </div>
        {listEdit && listEdit.kind !== "delete" && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveListEdit();
            }}
          >
            <input
              autoFocus
              value={listEdit.name}
              onChange={(e) => {
                setListEdit({ ...listEdit, name: e.target.value });
                setNote(null);
              }}
              onKeyDown={(e) => e.key === "Escape" && setListEdit(null)}
              placeholder={listEdit.kind === "new" ? "Name the list, e.g. Commander" : "New name for this list"}
              aria-label={listEdit.kind === "new" ? "New list name" : "Rename list"}
              className="min-w-0 flex-1 rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-3 py-2 text-sm text-(--color-text) placeholder:text-(--color-text-dim)"
            />
            <button type="submit" disabled={!listEdit.name.trim()} className="rounded-lg bg-(--color-accent) px-4 text-sm font-semibold text-black disabled:opacity-40">
              {listEdit.kind === "new" ? "Add list" : "Save"}
            </button>
            <button type="button" onClick={() => setListEdit(null)} className="rounded-lg border border-(--color-border) px-3 text-sm text-(--color-text)">
              Cancel
            </button>
          </form>
        )}
      </section>

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
          {dealing ? "Dealing…" : hands ? "Deal again" : `Deal from ${list.name}`}
        </button>
        {short && (
          <p className="text-sm text-(--color-text-dim)">
            {decks.length === 0
              ? `Add decks to ${list.name} below to start dealing.`
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

      {/* The decks in this list */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-sm font-medium text-(--color-text)">
            {list.name} · {decks.length}
            {decks.length > 0 && <span className="text-(--color-text-dim)"> ({pool.length} in the pool)</span>}
          </h2>
          <span className="ml-auto flex gap-1">
            <button
              type="button"
              onClick={() => setListEdit({ kind: "rename", name: list.name })}
              className="rounded px-2 py-1 text-xs text-(--color-text-dim) hover:bg-white/5 hover:text-(--color-text)"
            >
              Rename list
            </button>
            <button
              type="button"
              onClick={() => (listEdit?.kind === "delete" ? (changeBoth(deleteList(lists, map, list.id, now())), setListEdit(null)) : setListEdit({ kind: "delete" }))}
              onBlur={() => setListEdit((e) => (e?.kind === "delete" ? null : e))}
              className={
                "rounded px-2 py-1 text-xs " +
                (listEdit?.kind === "delete" ? "bg-red-500/15 text-red-300" : "text-(--color-text-dim) hover:bg-white/5 hover:text-(--color-text)")
              }
            >
              {listEdit?.kind === "delete" ? `Delete ${list.name} and its ${decks.length} deck${decks.length === 1 ? "" : "s"}?` : "Delete list"}
            </button>
          </span>
        </div>

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
            placeholder={`Add decks to ${list.name}, one per line\n(paste a whole list if you like)`}
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
                  onChange={(e) => changeDecks(setActive(map, d.id, e.target.checked, now()))}
                  aria-label={`${d.name} is in the pool`}
                  title="In the pool"
                  className="h-4.5 w-4.5 shrink-0 accent-(--color-accent)"
                />
                {editing?.id === d.id ? (
                  <form
                    className="flex min-w-0 flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      changeDecks(renameDeck(map, d.id, editing.name, now()));
                      setEditing(null);
                    }}
                  >
                    <input
                      autoFocus
                      value={editing.name}
                      onChange={(e) => setEditing({ id: d.id, name: e.target.value })}
                      onBlur={() => {
                        changeDecks(renameDeck(map, d.id, editing.name, now()));
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
                      changeDecks(deleteDeck(map, d.id, now()));
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

  function changeBoth(next: { lists: ListMap; decks: DeckMap }) {
    changeLists(next.lists);
    changeDecks(next.decks);
    setHands(null);
  }
}
