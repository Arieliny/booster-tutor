import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { artChoice, card, data, inMyCube, normalizeStatus, type Decisions } from "../lib/cube-review";
import { downloadText } from "../lib/cube-export";
import { fetchCardsByIds } from "../lib/scryfall-enrich";
import { moxfieldLines, planCubeCobraCommit, type CobraCube, type CommitAdd, type CommitPlan } from "../lib/cube-commit";
import { loadChecklists, nameKey } from "../lib/checklists";

/**
 * Commit changes (My cube): put the decisions on the sites that hold the lists.
 * Neither site lets an app edit a list, so this prepares what each one's own
 * bulk tool takes (see lib/cube-commit.ts) and says where it goes:
 *  - Cube Cobra: a replacement CSV with the adds in and the cuts out. Once it's
 *    saved there, the daily check notices the new list and rebuilds Booster
 *    Tutor, after which the adds read Keep and the cuts are gone.
 *  - Moxfield: a checklist's cards still to come, for a deck's Bulk Edit.
 */

const MOXFIELD_KEY = "booster-tutor-moxfield-deck";
/** Ari's "Pauper Cube (still missing)" list. */
const DEFAULT_MOXFIELD = "https://moxfield.com/decks/ucCeAWzJ7ni4_phxDxwWoQ";

const btn = "inline-flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-2 text-sm text-(--color-text) hover:bg-white/5 disabled:opacity-40";
const primary = "inline-flex items-center gap-1.5 rounded-lg bg-(--color-accent) px-3 py-2 text-sm font-medium text-black hover:bg-(--color-accent-bright) disabled:opacity-40";
const head = "text-xs font-medium tracking-wide text-(--color-text-dim) uppercase";

type CobraState =
  | { s: "idle" }
  | { s: "working"; what: string }
  | { s: "ready"; plan: CommitPlan; noPrinting: string[] }
  | { s: "error"; message: string };

export function CommitChanges({ decisions, expectedAfter }: { decisions: Decisions; expectedAfter: number }) {
  const cubeId = data.cubes.mine.cubeId;
  const [cobra, setCobra] = useState<CobraState>({ s: "idle" });

  const { cuts, addIds } = useMemo(() => {
    const cuts = new Set<string>();
    const addIds: string[] = [];
    for (const id of Object.keys(decisions)) {
      if (!card(id)) continue;
      const s = normalizeStatus(id, decisions[id]?.status);
      if (s === "cut" && inMyCube(id)) cuts.add(id);
      if (s === "add" && !inMyCube(id)) addIds.push(id);
    }
    return { cuts, addIds };
  }, [decisions]);

  const prepare = async () => {
    try {
      setCobra({ s: "working", what: "Reading your cube on Cube Cobra" });
      const res = await fetch(`https://cubecobra.com/cube/api/cubeJSON/${encodeURIComponent(cubeId)}`);
      if (!res.ok) throw new Error(`Cube Cobra answered HTTP ${res.status}.`);
      const cube = (await res.json()) as CobraCube;
      // Each add as the printing chosen for it in Cube review, else its default one.
      setCobra({ s: "working", what: `Finding the printings of ${addIds.length} added card${addIds.length === 1 ? "" : "s"}` });
      const sidOf = new Map(addIds.map((id) => [id, artChoice(id)?.sid || card(id).sid]));
      const { cards } = await fetchCardsByIds([...new Set(sidOf.values())]);
      const bySid = new Map(cards.map((c) => [c.scryfall_id, c]));
      const adds: CommitAdd[] = [];
      const noPrinting: string[] = [];
      for (const id of addIds) {
        const p = bySid.get(sidOf.get(id)!);
        if (p?.set && p.collector_number) adds.push({ oracleId: id, name: p.name, set: p.set, collectorNumber: p.collector_number });
        else noPrinting.push(card(id).name);
      }
      setCobra({ s: "ready", plan: planCubeCobraCommit(cube, cuts, adds), noPrinting });
    } catch (err) {
      setCobra({ s: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="text-sm text-(--color-text-dim)">
        Cube Cobra and Moxfield don't let other apps change your lists, so this gets each one ready for its own import: one upload or one
        paste, and nothing changes until you save it there.
      </p>

      <section className="space-y-3 rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-4">
        <div className="flex items-center gap-2">
          <Icon name="cube" className="h-5 w-5 text-(--color-text-dim)" />
          <h3 className="flex-1 font-medium text-(--color-text)">Cube Cobra · {data.cubes.mine.name}</h3>
        </div>
        <p className="text-sm text-(--color-text-dim)">
          Your decisions: {addIds.length} to add, {cuts.size} to cut.
        </p>

        {cobra.s === "idle" || cobra.s === "error" ? (
          <div className="space-y-2">
            {cobra.s === "error" && <p className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">{cobra.message}</p>}
            <button type="button" onClick={() => void prepare()} disabled={!addIds.length && !cuts.size} className={primary}>
              Prepare the file
            </button>
          </div>
        ) : cobra.s === "working" ? (
          <p className="flex items-center gap-2 text-sm text-(--color-text-dim)">
            <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-(--color-accent) border-t-transparent" />
            {cobra.what}…
          </p>
        ) : (
          <CobraPlan plan={cobra.plan} noPrinting={cobra.noPrinting} expectedAfter={expectedAfter} cubeId={cubeId} onRedo={() => void prepare()} />
        )}
      </section>

      <MoxfieldSection />
    </div>
  );
}

function CobraPlan({
  plan,
  noPrinting,
  expectedAfter,
  cubeId,
  onRedo,
}: {
  plan: CommitPlan;
  noPrinting: string[];
  expectedAfter: number;
  cubeId: string;
  onRedo: () => void;
}) {
  const nothing = !plan.removed.length && !plan.added.length;
  const fileName = `${cubeId}-${new Date().toISOString().slice(0, 10)}.csv`;
  return (
    <div className="space-y-3">
      <div className="text-2xl font-semibold text-(--color-text) tabular-nums">
        {plan.before} → {plan.after} <span className="text-sm font-normal text-(--color-text-dim)">cards</span>
      </div>
      {plan.after !== expectedAfter && !nothing && (
        <p className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Booster Tutor counts {expectedAfter} after your decisions. The difference is usually a card changed on Cube Cobra since the last
          rebuild; check the lists below.
        </p>
      )}
      {nothing ? (
        <p className="text-sm text-(--color-text)">Cube Cobra already matches your decisions. Nothing to upload.</p>
      ) : (
        <>
          {plan.added.length > 0 && (
            <Names title={`Adding ${plan.added.length}`} names={plan.added.map((a) => `${a.name} · ${a.set.toUpperCase()} #${a.collectorNumber}`)} />
          )}
          {plan.removed.length > 0 && (
            <Names title={`Cutting ${plan.removed.length}`} names={plan.removed.map((r) => (r.copies > 1 ? `${r.name} ×${r.copies}` : r.name))} />
          )}
        </>
      )}
      {(plan.addsAlreadyThere.length > 0 || plan.cutsNotThere.length > 0) && (
        <p className="text-xs text-(--color-text-dim)">
          Already done on Cube Cobra: {plan.addsAlreadyThere.length} add{plan.addsAlreadyThere.length === 1 ? "" : "s"}, {plan.cutsNotThere.length} cut
          {plan.cutsNotThere.length === 1 ? "" : "s"}. Booster Tutor catches up at its next rebuild.
        </p>
      )}
      {noPrinting.length > 0 && (
        <p className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Left out (Scryfall had no printing for them): {noPrinting.join(", ")}. Add them on Cube Cobra by hand.
        </p>
      )}
      {!nothing && (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadText(fileName, plan.csv)} className={primary}>
              Download the file
            </button>
            <a href={`https://cubecobra.com/cube/list/${encodeURIComponent(cubeId)}`} target="_blank" rel="noopener noreferrer" className={btn}>
              Open Cube Cobra
            </a>
            <button type="button" onClick={onRedo} className={btn}>
              Check again
            </button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-(--color-text-dim)">
            <li>On Cube Cobra, open your cube's List and switch to Edit.</li>
            <li>
              Import → <b className="font-medium text-(--color-text)">Replace with CSV Upload</b>, and pick <span className="text-(--color-text)">{fileName}</span>.
            </li>
            <li>The Confirm Import page lists what changes. It should be exactly the cards above. Then Save Changes.</li>
            <li>Booster Tutor sees the new list within a day and rebuilds: your adds then read Keep, and the cuts are gone.</li>
          </ol>
          <p className="text-xs text-(--color-text-dim)">
            Every other card goes in the file exactly as Cube Cobra has it (same printing), so Cube Cobra leaves it alone, with its status and
            tags. The basics stay too.
          </p>
        </>
      )}
    </div>
  );
}

function Names({ title, names }: { title: string; names: string[] }) {
  return (
    <details className="rounded border border-(--color-border)" open={names.length <= 12}>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-(--color-text)">{title}</summary>
      <ul className="max-h-64 space-y-0.5 overflow-y-auto px-3 pb-2 text-sm text-(--color-text-dim)">
        {names.map((n, i) => (
          <li key={i} className="truncate">
            {n}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** A checklist's cards still to come (not ticked, or flagged), for a Moxfield deck's Bulk Edit. */
function MoxfieldSection() {
  const [{ lists, marks }] = useState(loadChecklists);
  const named = lists.filter((l) => l.source.kind === "names");
  const [listId, setListId] = useState(named.at(-1)?.id ?? "");
  const [deck, setDeck] = useState(() => {
    try {
      return localStorage.getItem(MOXFIELD_KEY) ?? DEFAULT_MOXFIELD;
    } catch {
      return DEFAULT_MOXFIELD;
    }
  });
  const [copied, setCopied] = useState(false);
  const list = named.find((l) => l.id === listId);
  const src = list?.source.kind === "names" ? list.source : undefined;
  const m = (list && marks[list.id]) ?? {};
  const left = (src?.names ?? []).filter((n) => m[nameKey(n)] !== 1);
  const problems = left.filter((n) => m[nameKey(n)] === 2).length;
  const text = moxfieldLines(left.map((n) => ({ name: n, qty: src?.details?.[nameKey(n)]?.qty, printing: src?.details?.[nameKey(n)]?.printing })));
  const saveDeck = (v: string) => {
    setDeck(v);
    try {
      localStorage.setItem(MOXFIELD_KEY, v);
    } catch {
      // Not remembered; still works this time.
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-4">
      <div className="flex items-center gap-2">
        <Icon name="list" className="h-5 w-5 text-(--color-text-dim)" />
        <h3 className="flex-1 font-medium text-(--color-text)">Moxfield · cards still to come</h3>
      </div>
      {named.length === 0 ? (
        <p className="text-sm text-(--color-text-dim)">
          Make a checklist from a pasted list or an order file first (My cube → Checklists). What you haven't ticked becomes the list to paste
          here.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <label className={head} htmlFor="commit-checklist">
              From the checklist
            </label>
            <select
              id="commit-checklist"
              value={listId}
              onChange={(e) => (setListId(e.target.value), setCopied(false))}
              className="w-full rounded border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text)"
            >
              {named.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <p className="text-sm text-(--color-text-dim)">
              {left.length} still to come{problems ? ` (${problems} flagged with a problem)` : ""} of {src?.names.length ?? 0}.
            </p>
          </div>
          <textarea readOnly value={text} rows={6} aria-label="The list for Moxfield" className="w-full rounded border border-(--color-border) bg-(--color-bg) px-3 py-2 font-mono text-xs text-(--color-text)" />
          <div className="space-y-1.5">
            <label className={head} htmlFor="commit-deck">
              Moxfield deck
            </label>
            <input
              id="commit-deck"
              value={deck}
              onChange={(e) => saveDeck(e.target.value)}
              className="w-full rounded border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text)"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!left.length}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                } catch {
                  // Clipboard blocked: the box above can be selected and copied by hand.
                }
              }}
              className={primary}
            >
              {copied ? "Copied" : "Copy the list"}
            </button>
            {/^https:\/\/(www\.)?moxfield\.com\//.test(deck) && (
              <a href={deck} target="_blank" rel="noopener noreferrer" className={btn}>
                Open the deck
              </a>
            )}
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-(--color-text-dim)">
            <li>On Moxfield, open the deck and choose Bulk Edit.</li>
            <li>Select everything in the main list's box and paste over it.</li>
            <li>Check it shows these {left.length} cards, then Save. The cards you ticked drop off the list.</li>
          </ol>
        </>
      )}
    </section>
  );
}
