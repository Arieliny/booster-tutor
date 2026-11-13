import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { artChoice, card, data, inMyCube, normalizeStatus, type Decisions } from "../lib/cube-review";
import { downloadText } from "../lib/cube-export";
import { fetchCardsByIds } from "../lib/scryfall-enrich";
import { moxfieldLines, planCubeCobraCommit, type CobraCard, type CobraCube, type CommitAdd, type CommitPlan } from "../lib/cube-commit";
import { loadChecklists, nameKey } from "../lib/checklists";
import {
  POWERED_MOXFIELD,
  claudeRequest,
  copyKind,
  hasCommitChecklist,
  orderDetail,
  poweredLine,
  tickedScope,
  type CopyTag,
  type Scope,
} from "../lib/commit-scope";
import { REMOTE_CHANGE_EVENT } from "../lib/user-sync";

/**
 * Commit changes (My cube): put the decisions on the sites that hold the lists.
 * Neither site lets an app edit a list, so this prepares what each one's own
 * bulk tool takes (see lib/cube-commit.ts) and says where it goes:
 *  - What: every Add / Cut decision, or only what's ticked on a checklist
 *    (Checklists' "Commit what you've ticked" opens this that way).
 *  - Cube Cobra: a replacement CSV with the adds in and the cuts out. Once it's
 *    saved there, the daily check notices the new list and rebuilds Booster
 *    Tutor, after which the adds read Keep and the cuts are gone.
 *  - Moxfield, the powered deck: lines for its Bulk Edit, each tagged #CUBE and
 *    #REAL or #PROXY (lib/commit-scope.ts guesses which; tap to switch), cuts to
 *    its Sideboard.
 *  - Claude: the same changes as a request to paste into the CubeOrdering
 *    session, which makes them on both sites.
 *  - Moxfield, a checklist's cards still to come (the pauper still-missing list).
 */

const MOXFIELD_KEY = "booster-tutor-moxfield-deck";
/** Ari's "Pauper Cube (still missing)" list. */
const DEFAULT_MOXFIELD = "https://moxfield.com/decks/ucCeAWzJ7ni4_phxDxwWoQ";
/** Real copy or proxy, where Ari set it by hand (this device only). */
const COPY_KEY = "booster-tutor-commit-copy-v1";

const btn = "inline-flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-2 text-sm text-(--color-text) hover:bg-white/5 disabled:opacity-40";
const primary = "inline-flex items-center gap-1.5 rounded-lg bg-(--color-accent) px-3 py-2 text-sm font-medium text-black hover:bg-(--color-accent-bright) disabled:opacity-40";
const head = "text-xs font-medium tracking-wide text-(--color-text-dim) uppercase";
const box = "space-y-3 rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-4";

type Mode = "ticked" | "all";

type CobraState =
  | { s: "idle" }
  | { s: "working"; what: string }
  | { s: "ready"; plan: CommitPlan; noPrinting: string[]; cutPrint: Record<string, { set?: string; cn?: string }> }
  | { s: "error"; message: string };

function loadCopy(): Record<string, CopyTag> {
  try {
    return JSON.parse(localStorage.getItem(COPY_KEY) ?? "{}") as Record<string, CopyTag>;
  } catch {
    return {};
  }
}

export function CommitChanges({ decisions, expectedAfter }: { decisions: Decisions; expectedAfter: number }) {
  const cubeId = data.cubes.mine.cubeId;
  const [checklists, setChecklists] = useState(loadChecklists);
  const [mode, setMode] = useState<Mode>(() => (hasCommitChecklist(checklists.lists) ? "ticked" : "all"));
  // Prepared for one set of cards (scopeKey): a different set needs a fresh file.
  const [prepared, setPrepared] = useState<{ key: string; state: CobraState }>({ key: "", state: { s: "idle" } });
  const [copy, setCopy] = useState(loadCopy);

  // Ticks made on another device show up here too.
  useEffect(() => {
    const reload = () => setChecklists(loadChecklists());
    window.addEventListener(REMOTE_CHANGE_EVENT, reload);
    return () => window.removeEventListener(REMOTE_CHANGE_EVENT, reload);
  }, []);

  const decided = useMemo(() => {
    const cuts: string[] = [];
    const adds: string[] = [];
    for (const id of Object.keys(decisions)) {
      if (!card(id)) continue;
      const s = normalizeStatus(id, decisions[id]?.status);
      if (s === "cut" && inMyCube(id)) cuts.push(id);
      if (s === "add" && !inMyCube(id)) adds.push(id);
    }
    return { adds, cuts };
  }, [decisions]);

  const scope: Scope = useMemo(
    () =>
      mode === "ticked"
        ? tickedScope(decided.adds, decided.cuts, checklists.lists, checklists.marks, (id) => card(id).name)
        : { ...decided, addsWaiting: [], cutsWaiting: [] },
    [mode, decided, checklists],
  );
  const scopeKey = `${mode}|${scope.adds.join()}|${scope.cuts.join()}`;
  const cobra: CobraState = prepared.key === scopeKey ? prepared.state : { s: "idle" };
  const setCobra = (state: CobraState) => setPrepared({ key: scopeKey, state });

  const prepare = async () => {
    try {
      setCobra({ s: "working", what: "Reading your cube on Cube Cobra" });
      const res = await fetch(`https://cubecobra.com/cube/api/cubeJSON/${encodeURIComponent(cubeId)}`);
      if (!res.ok) throw new Error(`Cube Cobra answered HTTP ${res.status}.`);
      const cube = (await res.json()) as CobraCube;
      // Each add as the printing chosen for it in Cube review, else its default one.
      setCobra({ s: "working", what: `Finding the printings of ${scope.adds.length} added card${scope.adds.length === 1 ? "" : "s"}` });
      const sidOf = new Map(scope.adds.map((id) => [id, artChoice(id)?.sid || card(id).sid]));
      const { cards } = await fetchCardsByIds([...new Set(sidOf.values())]);
      const bySid = new Map(cards.map((c) => [c.scryfall_id, c]));
      const adds: CommitAdd[] = [];
      const noPrinting: string[] = [];
      for (const id of scope.adds) {
        const p = bySid.get(sidOf.get(id)!);
        if (p?.set && p.collector_number) adds.push({ oracleId: id, name: p.name, set: p.set, collectorNumber: p.collector_number });
        else noPrinting.push(card(id).name);
      }
      // Each cut's printing on Cube Cobra now, for its Moxfield Sideboard line.
      const main = (Array.isArray(cube.cards.mainboard) ? cube.cards.mainboard : []) as CobraCard[];
      const cutPrint: Record<string, { set?: string; cn?: string }> = {};
      for (const c of main) {
        const id = c.details?.oracle_id;
        if (id && scope.cuts.includes(id)) cutPrint[id] = { set: c.details?.set, cn: c.details?.collector_number };
      }
      setCobra({ s: "ready", plan: planCubeCobraCommit(cube, new Set(scope.cuts), adds), noPrinting, cutPrint });
    } catch (err) {
      setCobra({ s: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  /** Real or proxy for a card, and why; tapping flips it and remembers the choice. */
  const kindOf = (id: string, name: string) => copyKind(card(id)?.owned, orderDetail(name, checklists.lists).from, copy[id]);
  const flip = (id: string, name: string) => {
    const now = kindOf(id, name).tag;
    const auto = copyKind(card(id)?.owned, orderDetail(name, checklists.lists).from, undefined).tag;
    const next: CopyTag = now === "REAL" ? "PROXY" : "REAL";
    const out = { ...copy };
    if (next === auto) delete out[id];
    else out[id] = next;
    setCopy(out);
    try {
      localStorage.setItem(COPY_KEY, JSON.stringify(out));
    } catch {
      // Not remembered; still applies this time.
    }
  };

  const waiting = [...scope.addsWaiting, ...scope.cutsWaiting].map((id) => card(id).name).sort((a, b) => a.localeCompare(b));
  const nothingToDo = !scope.adds.length && !scope.cuts.length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="text-sm text-(--color-text-dim)">
        Cube Cobra and Moxfield don't let other apps change your lists, so this gets each one ready for its own import: one upload or one
        paste, and nothing changes until you save it there. Or copy it as a request for Claude, who makes the changes on both.
      </p>

      <section className={box}>
        <h3 className="font-medium text-(--color-text)">What to commit</h3>
        <div role="radiogroup" aria-label="What to commit" className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["ticked", "What you've ticked", "Cards ticked on Coming in, Going out or an order checklist"],
              ["all", "Every decision", "All your Adds and Cuts, ticked or not"],
            ] as [Mode, string, string][]
          ).map(([m, label, sub]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={
                "min-h-12 rounded-lg border px-3 py-2 text-left " +
                (mode === m ? "border-(--color-accent) bg-(--color-accent)/15" : "border-(--color-border) hover:bg-white/5")
              }
            >
              <span className="block text-sm font-medium text-(--color-text)">{label}</span>
              <span className="block text-xs text-(--color-text-dim)">{sub}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-(--color-text)">
          {scope.adds.length} to add, {scope.cuts.length} to cut.
        </p>
        {waiting.length > 0 && <Names title={`Not ticked yet, so left out: ${waiting.length}`} names={waiting} />}
      </section>

      <section className={box}>
        <div className="flex items-center gap-2">
          <Icon name="cube" className="h-5 w-5 text-(--color-text-dim)" />
          <h3 className="flex-1 font-medium text-(--color-text)">Cube Cobra · {data.cubes.mine.name}</h3>
        </div>

        {cobra.s === "idle" || cobra.s === "error" ? (
          <div className="space-y-2">
            {cobra.s === "error" && <p className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">{cobra.message}</p>}
            <button type="button" onClick={() => void prepare()} disabled={nothingToDo} className={primary}>
              Prepare the changes
            </button>
            <p className="text-xs text-(--color-text-dim)">Reads your cube on Cube Cobra, then gets the file, the Moxfield lines and the request for Claude ready.</p>
          </div>
        ) : cobra.s === "working" ? (
          <p className="flex items-center gap-2 text-sm text-(--color-text-dim)">
            <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-(--color-accent) border-t-transparent" />
            {cobra.what}…
          </p>
        ) : (
          <CobraPlan
            plan={cobra.plan}
            noPrinting={cobra.noPrinting}
            expectedAfter={mode === "all" ? expectedAfter : undefined}
            cubeId={cubeId}
            onRedo={() => void prepare()}
          />
        )}
      </section>

      {cobra.s === "ready" && (cobra.plan.added.length > 0 || cobra.plan.removed.length > 0) && (
        <>
          <PoweredMoxfield plan={cobra.plan} cutPrint={cobra.cutPrint} kindOf={kindOf} onFlip={flip} />
          <ForClaude
            text={claudeRequest({
              cubeId,
              before: cobra.plan.before,
              after: cobra.plan.after,
              adds: cobra.plan.added.map((a) => {
                const k = kindOf(a.oracleId, a.name);
                const has = k.tag === "REAL" ? orderDetail(a.name, checklists.lists).printing : undefined;
                return { name: a.name, set: a.set, collectorNumber: a.collectorNumber, tag: k.tag, why: k.why, ...(has && { has }) };
              }),
              cuts: cobra.plan.removed.map((r) => ({ name: r.name, set: cobra.cutPrint[r.oracleId]?.set, collectorNumber: cobra.cutPrint[r.oracleId]?.cn })),
              waiting,
              moxfield: POWERED_MOXFIELD,
            })}
          />
        </>
      )}

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
  /** Booster Tutor's count after every decision; only compared when committing every decision. */
  expectedAfter?: number;
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
      {expectedAfter !== undefined && plan.after !== expectedAfter && !nothing && (
        <p className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Booster Tutor counts {expectedAfter} after your decisions. The difference is usually a card changed on Cube Cobra since the last
          rebuild; check the lists below.
        </p>
      )}
      {nothing ? (
        <p className="text-sm text-(--color-text)">Cube Cobra already has these changes. Nothing to upload.</p>
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

/** The powered deck on Moxfield: adds into Main Deck, cuts moved to the Sideboard, every line tagged real or proxy. */
function PoweredMoxfield({
  plan,
  cutPrint,
  kindOf,
  onFlip,
}: {
  plan: CommitPlan;
  cutPrint: Record<string, { set?: string; cn?: string }>;
  kindOf: (id: string, name: string) => { tag: CopyTag; why: string };
  onFlip: (id: string, name: string) => void;
}) {
  const rows = [
    ...plan.added.map((a) => ({ id: a.oracleId, name: a.name, set: a.set, cn: a.collectorNumber, cut: false })),
    ...plan.removed.map((r) => ({ id: r.oracleId, name: r.name, set: cutPrint[r.oracleId]?.set, cn: cutPrint[r.oracleId]?.cn, cut: true })),
  ];
  const line = (r: (typeof rows)[number]) =>
    r.set && r.cn ? poweredLine(r.name, r.set, r.cn, kindOf(r.id, r.name).tag) : `1 ${r.name} #CUBE #${kindOf(r.id, r.name).tag}`;
  const mainAdds = rows.filter((r) => !r.cut).map(line).join("\n");
  const sideAdds = rows.filter((r) => r.cut).map(line).join("\n");
  const mainCuts = plan.removed.map((r) => r.name);

  return (
    <section className={box}>
      <div className="flex items-center gap-2">
        <Icon name="list" className="h-5 w-5 text-(--color-text-dim)" />
        <h3 className="flex-1 font-medium text-(--color-text)">Moxfield · Powered Cube</h3>
        <a href={`${POWERED_MOXFIELD}/edit`} target="_blank" rel="noopener noreferrer" className={btn}>
          Open Bulk Edit
        </a>
      </div>
      <p className="text-sm text-(--color-text-dim)">
        Real copy or proxy is a guess from your orders. Tap a card to switch it; the reason shows under its name.
      </p>
      <ul className="divide-y divide-(--color-border) rounded border border-(--color-border)">
        {rows.map((r) => {
          const k = kindOf(r.id, r.name);
          return (
            <li key={`${r.cut ? "cut" : "add"}-${r.id}`}>
              <button
                type="button"
                onClick={() => onFlip(r.id, r.name)}
                aria-label={`${r.name}: ${k.tag === "REAL" ? "real copy" : "proxy"}. Switch`}
                className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-(--color-text)">
                    {r.cut ? "Cut · " : "Add · "}
                    {r.name}
                  </span>
                  <span className="block truncate text-xs text-(--color-text-dim)">
                    {r.set ? `${r.set.toUpperCase()} #${r.cn} · ` : ""}
                    {k.why}
                  </span>
                </span>
                <span
                  className={
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium " +
                    (k.tag === "REAL" ? "bg-emerald-500/20 text-emerald-200" : "bg-sky-500/20 text-sky-200")
                  }
                >
                  #{k.tag}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {mainAdds && <Paste label="Add to the end of Main Deck" text={mainAdds} />}
      {mainCuts.length > 0 && <Names title={`Delete from Main Deck: ${mainCuts.length}`} names={mainCuts} />}
      {sideAdds && <Paste label="Then add to the end of Sideboard" text={sideAdds} />}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-(--color-text-dim)">
        <li>Open Bulk Edit. Main Deck, Sideboard and Considering each have a tab.</li>
        <li>In Main Deck, paste the new lines at the end and delete the cut cards' lines. Save &amp; Continue Editing.</li>
        <li>In Sideboard, paste the cut cards' lines at the end. Save.</li>
        <li>Main Deck should then match Cube Cobra's count. If an added card was in Considering, delete it there too.</li>
      </ol>
      <p className="text-xs text-(--color-text-dim)">
        Real copies use the printing chosen here; if yours is a different one, change it on its line. A cut card keeps the tags it had on
        Moxfield if you'd rather move its own line.
      </p>
    </section>
  );
}

/** The same changes as a request for Claude, who makes them on Cube Cobra and Moxfield. */
function ForClaude({ text }: { text: string }) {
  return (
    <section className={box}>
      <div className="flex items-center gap-2">
        <Icon name="sparkle" className="h-5 w-5 text-(--color-text-dim)" />
        <h3 className="flex-1 font-medium text-(--color-text)">Or ask Claude</h3>
      </div>
      <p className="text-sm text-(--color-text-dim)">
        Paste this into the CubeOrdering session. Claude uploads the file to Cube Cobra, edits the Moxfield deck, and checks both.
      </p>
      <Paste label="The request" text={text} rows={8} button="Copy for Claude" />
    </section>
  );
}

/** A read-only box with a copy button (the box can be selected by hand if the clipboard is blocked). */
function Paste({ label, text, rows = 4, button = "Copy" }: { label: string; text: string; rows?: number; button?: string }) {
  // What was copied last, so changing the text shows the button as "Copy" again.
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const copied = copiedText === text;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={head}>{label}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopiedText(text);
            } catch {
              // Clipboard blocked: select the box and copy by hand.
            }
          }}
          className={primary}
        >
          {copied ? "Copied" : button}
        </button>
      </div>
      <textarea
        readOnly
        value={text}
        rows={rows}
        aria-label={label}
        className="w-full rounded border border-(--color-border) bg-(--color-bg) px-3 py-2 font-mono text-xs text-(--color-text)"
      />
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
    <section className={box}>
      <div className="flex items-center gap-2">
        <Icon name="list" className="h-5 w-5 text-(--color-text-dim)" />
        <h3 className="flex-1 font-medium text-(--color-text)">Moxfield · a checklist's cards still to come</h3>
      </div>
      <p className="text-sm text-(--color-text-dim)">For a "still missing" list like the pauper cube's: what you haven't ticked yet, to paste over the deck.</p>
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
