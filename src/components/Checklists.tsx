import { useEffect, useMemo, useState } from "react";
import type { Cube } from "../types";
import { Inventory } from "./Inventory";
import { Icon } from "./Icon";
import {
  REVIEW_SOURCES,
  createChecklist,
  deleteChecklist,
  loadChecklists,
  nameKey,
  parseNames,
  renameChecklist,
  resetChecklist,
  setMark,
  type Checklist,
  type ChecklistSource,
  type Mark,
  type ReviewWhich,
} from "../lib/checklists";
import { REMOTE_CHANGE_EVENT } from "../lib/user-sync";
import { card, colorFacet, data, frontName, imageUrl, inMyCube, loadDecisions, members, normalizeStatus, type Decisions } from "../lib/cube-review";
import { inCubeAfter } from "../lib/combos";

/**
 * Checklists (My cube): named card lists to tick off, each with its own
 * progress, so moving between them never loses any. A checklist's cards come
 * from the Cube review decisions (cards coming in, going out, maybes, the cube
 * before or after the changes; these follow the decisions as they change) or
 * from a pasted list of names. Each uploaded cube's collection checklist (the
 * older received / missing marks) sits alongside.
 */

const ACTIVE_KEY = "booster-tutor-checklist-active";

type Filter = "all" | "todo" | "done" | "problem";
type Sort = "name" | "colour";

/** One card on a checklist, as shown. */
interface Item {
  key: string;
  name: string;
  img?: string;
  type?: string;
  colour: string;
}

const COLOUR_ORDER = ["W", "U", "B", "R", "G", "M", "C", "?"];
const COLOUR_LABEL: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", M: "Multicolour", C: "Colourless", "?": "Other" };

function reviewIds(which: ReviewWhich, d: Decisions): string[] {
  const all = Object.keys(data.cards);
  const status = (id: string) => normalizeStatus(id, d[id]?.status);
  switch (which) {
    case "add":
      return Object.keys(d).filter((id) => card(id) && status(id) === "add");
    case "cut":
      return Object.keys(d).filter((id) => card(id) && status(id) === "cut");
    case "maybe":
      return Object.keys(d).filter((id) => card(id) && status(id) === "maybe");
    case "now":
      return [...members.mine];
    case "after":
      return [...new Set([...all.filter((id) => inMyCube(id)), ...Object.keys(d)])].filter((id) => card(id) && inCubeAfter(id, d));
  }
}

/** Where a pasted name's picture and type come from: the Cube review cards, then the uploaded cubes. */
function nameIndex(cubes: Cube[]): Map<string, Omit<Item, "key">> {
  const out = new Map<string, Omit<Item, "key">>();
  for (const c of cubes) {
    for (const cc of c.cards) {
      const k = nameKey(cc.name);
      if (!out.has(k)) {
        const cols = cc.colors ?? [];
        out.set(k, { name: cc.name, img: cc.image_url ?? undefined, type: cc.type_line, colour: cols.length > 1 ? "M" : cols[0] ?? "C" });
      }
    }
  }
  for (const id of Object.keys(data.cards)) {
    const c = card(id);
    out.set(nameKey(frontName(c)), { name: c.name, img: imageUrl(c, "small") ?? undefined, type: c.type, colour: colorFacet(c) });
  }
  return out;
}

export function Checklists({ cubes }: { cubes: Cube[] }) {
  const [state, setState] = useState(loadChecklists);
  const [decisions, setDecisions] = useState<Decisions>(loadDecisions);
  const [active, setActiveRaw] = useState<string>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [creating, setCreating] = useState(false);
  const reload = () => {
    setState(loadChecklists());
    setDecisions(loadDecisions());
  };
  // Another device ticked something (or changed a decision): show it.
  useEffect(() => {
    window.addEventListener(REMOTE_CHANGE_EVENT, reload);
    return () => window.removeEventListener(REMOTE_CHANGE_EVENT, reload);
  }, []);

  const setActive = (id: string) => {
    setActiveRaw(id);
    try {
      localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      // Not remembered on this device; still works.
    }
  };

  const index = useMemo(() => nameIndex(cubes), [cubes]);

  /** The cards on a checklist right now. */
  const itemsFor = (list: Checklist): Item[] => {
    if (list.source.kind === "review") {
      return reviewIds(list.source.which, decisions).map((id) => {
        const c = card(id);
        return { key: id, name: c.name, img: imageUrl(c, "small") ?? undefined, type: c.type, colour: colorFacet(c) };
      });
    }
    return list.source.names.map((n) => {
      const k = nameKey(n);
      const known = index.get(k);
      return { key: k, name: known?.name ?? n, img: known?.img, type: known?.type, colour: known?.colour ?? "?" };
    });
  };

  // Each uploaded cube's collection checklist sits first; then the ones made here.
  const tabs = [
    ...cubes.map((c) => ({ id: `cube:${c.id}`, label: c.name, sub: "collection" })),
    ...state.lists.map((l) => {
      const items = itemsFor(l);
      const marks = state.marks[l.id] ?? {};
      return { id: l.id, label: l.name, sub: `${items.filter((i) => marks[i.key] === 1).length}/${items.length}` };
    }),
  ];
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  const cube = current?.id.startsWith("cube:") ? cubes.find((c) => `cube:${c.id}` === current.id) : undefined;
  const list = cube ? undefined : state.lists.find((l) => l.id === current?.id);

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => (setActive(t.id), setCreating(false))}
            aria-pressed={!creating && t.id === current?.id}
            className={
              "shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap " +
              (!creating && t.id === current?.id
                ? "border-(--color-accent) bg-(--color-accent)/15 text-(--color-text)"
                : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5")
            }
          >
            {t.label} <span className="text-xs text-(--color-text-dim)">· {t.sub}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-pressed={creating}
          className={
            "flex shrink-0 items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-sm whitespace-nowrap " +
            (creating ? "border-(--color-accent) text-(--color-text)" : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5")
          }
        >
          <Icon name="plus" className="h-4 w-4" /> New checklist
        </button>
      </div>

      {creating ? (
        <NewChecklist
          decisions={decisions}
          onCancel={() => setCreating(false)}
          onCreate={(name, source) => {
            const id = createChecklist(name, source);
            reload();
            setActive(id);
            setCreating(false);
          }}
        />
      ) : cube ? (
        <Inventory key={cube.id} cube={cube} />
      ) : list ? (
        <ChecklistView
          key={list.id}
          list={list}
          items={itemsFor(list)}
          marks={state.marks[list.id] ?? {}}
          onMark={(item, mark) => (setMark(list.id, item, mark), reload())}
          onRename={(name) => (renameChecklist(list.id, name), reload())}
          onReset={() => (resetChecklist(list.id), reload())}
          onDelete={() => (deleteChecklist(list.id), reload(), setActive(""))}
        />
      ) : (
        <p className="py-8 text-center text-sm text-(--color-text-dim)">No checklists yet. Make one with New checklist.</p>
      )}
    </div>
  );
}

function NewChecklist({ decisions, onCancel, onCreate }: { decisions: Decisions; onCancel: () => void; onCreate: (name: string, source: ChecklistSource) => void }) {
  const [which, setWhich] = useState<ReviewWhich | "names">("add");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const names = useMemo(() => parseNames(text), [text]);
  const counts = useMemo(() => Object.fromEntries(REVIEW_SOURCES.map((s) => [s.which, reviewIds(s.which, decisions).length])), [decisions]);
  const fallbackName = which === "names" ? "Pasted list" : REVIEW_SOURCES.find((s) => s.which === which)!.label;
  const ready = which !== "names" || names.length > 0;
  const option = (on: boolean) =>
    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm " +
    (on ? "border-(--color-accent) bg-(--color-accent)/10 text-(--color-text)" : "border-(--color-border) text-(--color-text-dim) hover:bg-white/5");
  return (
    <div className="space-y-4 rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium tracking-wide text-(--color-text-dim) uppercase" htmlFor="checklist-name">
          Name
        </label>
        <input
          id="checklist-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={fallbackName}
          maxLength={40}
          className="w-full rounded border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) placeholder:text-(--color-text-dim)"
        />
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-medium tracking-wide text-(--color-text-dim) uppercase">Which cards</div>
        <div className="space-y-1.5">
          {REVIEW_SOURCES.map((s) => (
            <button key={s.which} type="button" onClick={() => setWhich(s.which)} aria-pressed={which === s.which} className={option(which === s.which)}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{s.label}</span>
                <span className="block text-xs text-(--color-text-dim)">{s.hint}</span>
              </span>
              <span className="text-sm tabular-nums">{counts[s.which]}</span>
            </button>
          ))}
          <button type="button" onClick={() => setWhich("names")} aria-pressed={which === "names"} className={option(which === "names")}>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">A list of cards</span>
              <span className="block text-xs text-(--color-text-dim)">Paste names, one per line: an order, a cut list</span>
            </span>
          </button>
        </div>
        {which === "names" ? (
          <div className="space-y-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={"Lightning Bolt\n2x Counterspell\nSwords to Plowshares (STA) 10"}
              aria-label="Card names"
              className="w-full rounded border border-(--color-border) bg-(--color-bg) px-3 py-2 font-mono text-xs text-(--color-text) placeholder:text-(--color-text-dim)"
            />
            <p className="text-xs text-(--color-text-dim)">
              {names.length ? `${names.length} card${names.length === 1 ? "" : "s"}.` : "Counts and set codes are fine; each card is listed once."}
            </p>
          </div>
        ) : (
          <p className="text-xs text-(--color-text-dim)">Follows your Cube review decisions as they change. A tick stays with its card.</p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!ready}
          onClick={() => onCreate(name.trim() || fallbackName, which === "names" ? { kind: "names", names } : { kind: "review", which })}
          className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-black hover:bg-(--color-accent-bright) disabled:opacity-40"
        >
          Make the checklist
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-(--color-border) px-4 py-2 text-sm text-(--color-text-dim) hover:bg-white/5">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ChecklistView({
  list,
  items,
  marks,
  onMark,
  onRename,
  onReset,
  onDelete,
}: {
  list: Checklist;
  items: Item[];
  marks: Record<string, Mark>;
  onMark: (item: string, mark: 0 | Mark) => void;
  onRename: (name: string) => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("todo");
  const [sort, setSort] = useState<Sort>("name");
  const [confirm, setConfirm] = useState<"reset" | "delete" | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(list.name);

  const done = items.filter((i) => marks[i.key] === 1).length;
  const problems = items.filter((i) => marks[i.key] === 2).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = items.filter((i) => {
      const m = marks[i.key];
      if (filter === "todo" && m) return false;
      if (filter === "done" && m !== 1) return false;
      if (filter === "problem" && m !== 2) return false;
      return !q || i.name.toLowerCase().includes(q);
    });
    const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);
    return out.sort(sort === "colour" ? (a, b) => COLOUR_ORDER.indexOf(a.colour) - COLOUR_ORDER.indexOf(b.colour) || byName(a, b) : byName);
  }, [items, marks, search, filter, sort]);

  const source =
    list.source.kind === "review" ? REVIEW_SOURCES.find((s) => s.which === (list.source as { which: ReviewWhich }).which)?.hint : "A pasted list";
  const chip = (on: boolean) =>
    "px-3 py-1.5 text-xs transition-colors " + (on ? "bg-(--color-accent) font-medium text-black" : "text-(--color-text-dim) hover:bg-white/5");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-(--color-border) bg-black/30 p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {renaming ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  onRename(draft);
                  setRenaming(false);
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={40}
                  autoFocus
                  aria-label="Checklist name"
                  className="min-w-0 rounded border border-(--color-border) bg-(--color-bg) px-2 py-1 text-sm text-(--color-text)"
                />
                <button type="submit" className="rounded bg-(--color-accent) px-3 py-1 text-xs font-medium text-black">
                  Save
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setRenaming(true)} className="group flex items-center gap-1.5 text-left" aria-label={`Rename ${list.name}`}>
                <span className="truncate font-medium text-(--color-text)">{list.name}</span>
                <Icon name="pencil" className="h-3.5 w-3.5 text-(--color-text-dim) opacity-60 group-hover:opacity-100" />
              </button>
            )}
            <div className="text-xs text-(--color-text-dim)">{source}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold text-(--color-text) tabular-nums">
              {done} <span className="text-(--color-text-dim)">/ {items.length}</span>
            </div>
            <div className="text-xs text-(--color-text-dim)">
              {pct}% checked{problems ? ` · ${problems} problem${problems === 1 ? "" : "s"}` : ""}
            </div>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-(--color-bg)">
          <div className="h-full bg-(--color-accent) transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirm("reset")}
            disabled={!done && !problems}
            className="rounded border border-(--color-border) px-3 py-1.5 text-xs text-(--color-text-dim) hover:bg-white/5 disabled:opacity-40"
          >
            Start over
          </button>
          <button type="button" onClick={() => setConfirm("delete")} className="rounded border border-(--color-border) px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
            Delete
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cards…"
          className="min-w-[160px] flex-1 rounded border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text) placeholder:text-(--color-text-dim)"
        />
        <div role="radiogroup" aria-label="Show" className="inline-flex overflow-hidden rounded border border-(--color-border) bg-(--color-bg-elev)">
          {(
            [
              ["todo", "To do"],
              ["done", "Done"],
              ["problem", "Problems"],
              ["all", "All"],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)} className={chip(filter === f)}>
              {label}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Sort" className="inline-flex overflow-hidden rounded border border-(--color-border) bg-(--color-bg-elev)">
          {(
            [
              ["name", "A–Z"],
              ["colour", "Colour"],
            ] as [Sort, string][]
          ).map(([s, label]) => (
            <button key={s} type="button" role="radio" aria-checked={sort === s} onClick={() => setSort(s)} className={chip(sort === s)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-(--color-text-dim)">
          {items.length === 0 ? "This checklist has no cards right now." : filter === "todo" && !search ? "All checked. Nice." : "No cards match."}
        </p>
      ) : (
        <ul className="space-y-1">
          {shown.map((item, k) => {
            const m = marks[item.key];
            const header = sort === "colour" && (k === 0 || shown[k - 1].colour !== item.colour);
            return (
              <li key={item.key}>
                {header && <div className="mt-3 mb-1 text-xs font-medium tracking-wide text-(--color-text-dim) uppercase">{COLOUR_LABEL[item.colour]}</div>}
                <div
                  className={
                    "flex items-center gap-1 rounded border transition-colors " +
                    (m === 1 ? "border-(--color-accent)/40 bg-(--color-accent)/5" : m === 2 ? "border-amber-500/50 bg-amber-500/10" : "border-(--color-border)")
                  }
                >
                  <button
                    type="button"
                    onClick={() => onMark(item.key, m === 1 ? 0 : 1)}
                    aria-pressed={m === 1}
                    className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left hover:bg-white/5"
                  >
                    <span
                      aria-hidden
                      className={
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 " +
                        (m === 1 ? "border-(--color-accent) bg-(--color-accent) text-black" : "border-(--color-border)")
                      }
                    >
                      {m === 1 && <Icon name="check" className="h-3 w-3" />}
                    </span>
                    {item.img ? (
                      <img src={item.img} alt="" loading="lazy" className="h-12 w-9 shrink-0 rounded-sm object-cover" />
                    ) : (
                      <div className="h-12 w-9 shrink-0 rounded-sm bg-(--color-bg-elev)" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-(--color-text)">{item.name}</span>
                      <span className="block truncate text-xs text-(--color-text-dim)">{item.type ?? "Not in your card data"}</span>
                    </span>
                  </button>
                  {/* A problem with this card: wrong printing, damaged, not in the box. */}
                  <button
                    type="button"
                    onClick={() => onMark(item.key, m === 2 ? 0 : 2)}
                    aria-pressed={m === 2}
                    aria-label={m === 2 ? `${item.name}: clear the problem` : `${item.name}: flag a problem`}
                    title={m === 2 ? "Clear the problem" : "Flag a problem (wrong printing, damaged, missing)"}
                    className={"mr-1 shrink-0 rounded p-2 " + (m === 2 ? "text-amber-400" : "text-(--color-text-dim) opacity-50 hover:opacity-100")}
                  >
                    <Icon name="flag" className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-md rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-lg font-medium text-(--color-text)">{confirm === "reset" ? "Start this checklist over?" : `Delete ${list.name}?`}</h2>
            <p className="mb-4 text-(--color-text-dim)">
              {confirm === "reset"
                ? `This clears its ${done + problems} marks. Your other checklists keep theirs.`
                : "The checklist and its marks go away on every device. Your cards and decisions aren't touched."}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="rounded border border-(--color-border) px-4 py-2 text-sm text-(--color-text-dim) hover:bg-white/5">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm === "reset") onReset();
                  else onDelete();
                  setConfirm(null);
                }}
                className="rounded bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
              >
                {confirm === "reset" ? "Start over" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
