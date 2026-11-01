import { useMemo } from "react";
import { ARCHETYPES, parseTag } from "../lib/archetypes";
import { COMBOS, comboState } from "../lib/combos";
import {
  BALANCE_ROWS,
  balanceRow,
  card,
  cardTags,
  cmcFacet,
  data,
  hasCard,
  hasType,
  isStaple,
  members,
  normalizeStatus,
  summarize,
  type BalanceRow,
  type Decisions,
  type ReviewCard,
} from "../lib/cube-review";

/**
 * Cube shape: what the cube looks like AFTER the current decisions (keep / cut
 * / add), by colour, type, mana curve and guild. Every cell is the count after,
 * with the change from today beside it, and tapping a cell opens those cards.
 * For deciding what to cut without leaving a colour or a curve slot thin.
 */

const COLS: { id: BalanceRow; label: string }[] = BALANCE_ROWS.filter((r) => r.id !== "L").map((r) => ({
  id: r.id,
  label: r.id === "M" ? "Multi" : r.id === "C" ? "Colourless" : r.label,
}));

const TYPES = ["Creature", "Planeswalker", "Instant", "Sorcery", "Artifact", "Enchantment"] as const;
const TYPE_SHORT: Record<(typeof TYPES)[number], string> = {
  Creature: "Crea",
  Planeswalker: "PW",
  Instant: "Inst",
  Sorcery: "Sorc",
  Artifact: "Art",
  Enchantment: "Ench",
};

/** Curve buckets: 0 and 1 together (moxen, one-drops), 6+ together. */
const CURVE = ["0-1", "2", "3", "4", "5", "6+"] as const;
const curveOf = (c: ReviewCard): (typeof CURVE)[number] => {
  const f = cmcFacet(c);
  return f === "0" || f === "1" ? "0-1" : f === "6" || f === "7+" ? "6+" : f;
};

const GUILDS = ["WU", "UB", "BR", "RG", "GW", "WB", "UR", "BG", "RW", "GU"] as const;
const GUILD_NAME: Record<(typeof GUILDS)[number], string> = {
  WU: "Azorius",
  UB: "Dimir",
  BR: "Rakdos",
  RG: "Gruul",
  GW: "Selesnya",
  WB: "Orzhov",
  UR: "Izzet",
  BG: "Golgari",
  RW: "Boros",
  GU: "Simic",
};
const guildOf = (c: ReviewCard): string | null => {
  if (c.ci.length < 2) return null;
  if (c.ci.length > 2) return "3+";
  return GUILDS.find((g) => g.includes(c.ci[0]) && g.includes(c.ci[1])) ?? null;
};

/** The first type that decides which column a card goes in (a Creature Artifact counts as a creature). */
const typeOf = (c: ReviewCard): (typeof TYPES)[number] | null => TYPES.find((t) => hasType(c, t)) ?? null;

interface Cell {
  now: string[];
  after: string[];
}
const cell = (): Cell => ({ now: [], after: [] });

function shapeOf(decisions: Decisions) {
  const cuts = new Set<string>();
  const adds = new Set<string>();
  const base = new Set<string>();
  for (const [id, v] of Object.entries(decisions)) {
    const s = normalizeStatus(id, v.status);
    if (!hasCard(id)) continue;
    if (s === "cut") cuts.add(id);
    if (s === "add") adds.add(id);
    if (v.base) base.add(id);
  }
  const now = [...members.mine].filter((id) => data.cards[id]);
  const after = [...now.filter((id) => !cuts.has(id)), ...[...adds].filter((id) => !members.mine.has(id))];

  const byType = new Map<string, Cell>();
  const byCurve = new Map<string, Cell>();
  const byGuild = new Map<string, Cell>();
  const byBase = new Map<string, Cell>();
  // Per archetype: "key|all", "key|P" / "E" / "F"; plus the cuts and adds that carry the tag.
  const byArch = new Map<string, Cell>();
  const archCuts = new Map<string, string[]>();
  const archAdds = new Map<string, string[]>();
  const key = (m: Map<string, Cell>, k: string) => {
    let v = m.get(k);
    if (!v) m.set(k, (v = cell()));
    return v;
  };
  const tally = (ids: string[], which: "now" | "after") => {
    for (const id of ids) {
      const c = card(id);
      const row = balanceRow(c);
      if (which === "after" && base.has(id)) key(byBase, row).after.push(id);
      if (row === "L") {
        key(byType, "L")[which].push(id);
      } else {
        const t = typeOf(c);
        if (t) key(byType, `${row}|${t}`)[which].push(id);
        key(byType, `${row}|all`)[which].push(id);
        key(byCurve, `${row}|${curveOf(c)}`)[which].push(id);
        key(byCurve, `all|${curveOf(c)}`)[which].push(id);
      }
      const g = guildOf(c);
      if (g) key(byGuild, g)[which].push(id);
      for (const t of cardTags(id, decisions)) {
        const p = parseTag(t);
        if (!p) continue;
        key(byArch, `${p.key}|all`)[which].push(id);
        key(byArch, `${p.key}|${p.role}`)[which].push(id);
      }
    }
  };
  tally(now, "now");
  tally(after, "after");
  for (const [list, into] of [
    [cuts, archCuts],
    [adds, archAdds],
  ] as const)
    for (const id of list)
      for (const t of cardTags(id, decisions)) {
        const p = parseTag(t);
        if (p) (into.get(p.key) ?? into.set(p.key, []).get(p.key)!).push(id);
      }
  const anyTags = byArch.size > 0;
  const staples = after.filter((id) => isStaple(id, decisions));
  return { byType, byCurve, byGuild, byBase, byArch, archCuts, archAdds, anyTags, staples, cuts: cuts.size, adds: adds.size, base: base.size, after: after.length };
}

export function CubeShape({ decisions, onOpenCards }: { decisions: Decisions; onOpenCards: (ids: string[]) => void }) {
  const shape = useMemo(() => shapeOf(decisions), [decisions]);
  const s = useMemo(() => summarize(decisions), [decisions]);
  // Combos, the ones your cuts break first.
  const combos = useMemo(() => {
    const order = { broken: 0, incomplete: 1, complete: 2 };
    return COMBOS.map((c) => ({ c, ...comboState(c, decisions) })).sort((a, b) => order[a.state] - order[b.state]);
  }, [decisions]);

  const num = (c: Cell | undefined, strong = false) => {
    const after = c?.after.length ?? 0;
    const d = after - (c?.now.length ?? 0);
    const ids = c?.after.length ? c.after : (c?.now ?? []);
    return (
      <button
        type="button"
        disabled={!ids.length}
        onClick={() => onOpenCards(ids)}
        className={
          "w-full rounded px-1 py-1.5 text-right tabular-nums hover:bg-white/5 disabled:opacity-40 " +
          (strong ? "font-semibold text-(--color-text)" : "text-(--color-text)")
        }
      >
        {after}
        {d !== 0 && <span className={"ml-0.5 text-[10px] " + (d > 0 ? "text-emerald-300" : "text-red-300")}>{d > 0 ? `+${d}` : d}</span>}
      </button>
    );
  };
  /** A plain list of ids as a tappable count (the cuts or adds carrying an archetype's tag). */
  const list = (ids: string[], tone: string, sign: string) =>
    ids.length ? (
      <button type="button" onClick={() => onOpenCards(ids)} className={"w-full rounded px-1 py-1.5 text-right tabular-nums hover:bg-white/5 " + tone}>
        {sign}
        {ids.length}
      </button>
    ) : null;
  /** The cards in a row that aren't marked base: what's actually on the table to cut. */
  const flex = (c: Cell | undefined, b: Cell | undefined) => {
    const baseIds = new Set(b?.after ?? []);
    const ids = (c?.after ?? []).filter((id) => !baseIds.has(id));
    return (
      <button
        type="button"
        disabled={!ids.length}
        onClick={() => onOpenCards(ids)}
        className="w-full rounded px-1 py-1.5 text-right tabular-nums text-(--color-text-dim) hover:bg-white/5 disabled:opacity-40"
      >
        {ids.length}
      </button>
    );
  };
  const th = "py-1 text-right text-xs font-normal text-(--color-text-dim)";
  const rowHead = "py-1 pr-2 text-left text-xs text-(--color-text)";

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm text-(--color-text-dim)">After your decisions</span>
          <span className="text-3xl font-semibold tabular-nums text-(--color-text)">{s.result}</span>
          <span className="text-sm text-(--color-text-dim)">
            {s.current} now · <span className="text-red-300">{shape.cuts} cut</span> · <span className="text-emerald-300">{shape.adds} added</span>
          </span>
        </div>
        <p className="mt-1 text-sm text-(--color-text-dim)">
          {shape.base > 0 && (
            <>
              <span className="text-violet-200">{shape.base} base</span> · {shape.after - shape.base} could still be cut ·{" "}
            </>
          )}
          <button type="button" onClick={() => onOpenCards(shape.staples)} className="text-amber-200 hover:underline">
            {shape.staples.length} staples
          </button>{" "}
          (go in any deck; they keep their archetype tags)
        </p>`
        <p className="mt-1 text-xs text-(--color-text-dim)">
          Every number is the count after your cuts and adds, with the change from today beside it. Tap a number to open those cards.
        </p>
      </div>

      {shape.anyTags && (
        <Section
          title="Archetypes"
          hint="Cards tagged for each archetype (see docs/ARCHETYPES.md). P = payoffs, E = enablers, F = fits, counted after your decisions. Cut and Add show which archetypes lose or gain support."
        >
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th + " text-left"}>Archetype</th>
                <th className={th}>Now</th>
                <th className={th}>Cut</th>
                <th className={th}>Add</th>
                <th className={th}>After</th>
                <th className={th}>P</th>
                <th className={th}>E</th>
                <th className={th}>F</th>
              </tr>
            </thead>
            <tbody>
              {ARCHETYPES.map((a) => {
                const all = shape.byArch.get(`${a.key}|all`);
                const cut = shape.archCuts.get(a.key) ?? [];
                const add = shape.archAdds.get(a.key) ?? [];
                return (
                  <tr key={a.key} className="border-t border-(--color-border)">
                    <td className={rowHead}>
                      {a.label} <span className="text-(--color-text-dim)">{a.colors}</span>
                    </td>
                    <td className="py-1 text-right tabular-nums text-(--color-text-dim)">{all?.now.length ?? 0}</td>
                    <td className="py-0">{list(cut, "text-red-300", "−")}</td>
                    <td className="py-0">{list(add, "text-emerald-300", "+")}</td>
                    <td className="py-0">{num(all, true)}</td>
                    <td className="py-0">{num(shape.byArch.get(`${a.key}|P`))}</td>
                    <td className="py-0">{num(shape.byArch.get(`${a.key}|E`))}</td>
                    <td className="py-0">{num(shape.byArch.get(`${a.key}|F`))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      <Section
        title="Combos"
        hint={`${combos.filter((x) => x.state === "complete").length} of ${combos.length} complete after your decisions. A combo breaks when a cut empties one of its slots; "incomplete" means a piece was never in the cube (check the bench). Tap to open the pieces.`}
      >
        <ul className="divide-y divide-(--color-border)">
          {combos.map(({ c, state, missing }) => {
            const ids = c.slots.flat().map((x) => x.id).filter((x): x is string => !!x);
            const names = (slots: typeof c.slots) => slots.map((slot) => slot.map((x) => x.name).join(" / ")).join(" + ");
            return (
              <li key={c.id}>
                <button type="button" onClick={() => onOpenCards(ids)} className="flex w-full items-start gap-2 py-1.5 text-left text-xs hover:bg-white/5">
                  <span
                    className={
                      "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold " +
                      (state === "complete" ? "bg-emerald-500/20 text-emerald-200" : state === "broken" ? "bg-red-500/25 text-red-200" : "bg-slate-500/30 text-slate-200")
                    }
                  >
                    {state === "complete" ? "OK" : state === "broken" ? "Broken" : "Missing"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-(--color-text)">{names(c.slots)}</span>
                    <span className="block text-(--color-text-dim)">
                      {c.result}
                      {state !== "complete" && <> · needs {names(missing)}</>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Colours" hint="By colour identity. Lands are counted on their own line. Flex = after, minus the cards marked base.">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={th + " text-left"}>Colour</th>
              <th className={th}>Now</th>
              <th className={th}>Cut</th>
              <th className={th}>Add</th>
              <th className={th}>After</th>
              <th className={th}>Flex</th>
            </tr>
          </thead>
          <tbody>
            {s.balance.map((b) => {
              const c = b.id === "L" ? shape.byType.get("L") : shape.byType.get(`${b.id}|all`);
              return (
                <tr key={b.id} className="border-t border-(--color-border)">
                  <td className={rowHead}>{b.label}</td>
                  <td className="py-1 text-right tabular-nums text-(--color-text-dim)">{b.now}</td>
                  <td className="py-1 text-right tabular-nums text-red-300">{b.minus ? `−${b.minus}` : ""}</td>
                  <td className="py-1 text-right tabular-nums text-emerald-300">{b.plus ? `+${b.plus}` : ""}</td>
                  <td className="py-0">{num(c, true)}</td>
                  <td className="py-0">{flex(c, shape.byBase.get(b.id))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="Colour × type" hint="Non-land cards. A creature that is also an artifact counts as a creature.">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={th + " text-left"}></th>
              {TYPES.map((t) => (
                <th key={t} className={th} title={t}>
                  {TYPE_SHORT[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COLS.map((col) => (
              <tr key={col.id} className="border-t border-(--color-border)">
                <td className={rowHead}>{col.label}</td>
                {TYPES.map((t) => (
                  <td key={t} className="py-0">
                    {num(shape.byType.get(`${col.id}|${t}`))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Mana curve" hint="Non-land cards by mana value.">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={th + " text-left"}></th>
              {CURVE.map((k) => (
                <th key={k} className={th}>
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COLS.map((col) => (
              <tr key={col.id} className="border-t border-(--color-border)">
                <td className={rowHead}>{col.label}</td>
                {CURVE.map((k) => (
                  <td key={k} className="py-0">
                    {num(shape.byCurve.get(`${col.id}|${k}`))}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-(--color-border)">
              <td className={rowHead + " font-semibold"}>All</td>
              {CURVE.map((k) => (
                <td key={k} className="py-0">
                  {num(shape.byCurve.get(`all|${k}`), true)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="Guilds" hint="Cards whose colour identity is exactly that pair (gold, hybrid, off-colour activations).">
        <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
          {[...GUILDS, "3+" as const].map((g) => (
            <div key={g} className="flex items-center justify-between border-t border-(--color-border) py-0.5">
              <span className="text-xs text-(--color-text)">
                {g === "3+" ? "Three or more" : `${GUILD_NAME[g]} `}
                {g !== "3+" && <span className="text-(--color-text-dim)">{g}</span>}
              </span>
              <span className="w-14">{num(shape.byGuild.get(g))}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-3">
      <h3 className="text-sm font-semibold text-(--color-text)">{title}</h3>
      <p className="mb-2 text-xs text-(--color-text-dim)">{hint}</p>
      {children}
    </section>
  );
}
