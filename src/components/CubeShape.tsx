import { useMemo } from "react";
import {
  BALANCE_ROWS,
  balanceRow,
  card,
  cmcFacet,
  data,
  hasCard,
  hasType,
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
    }
  };
  tally(now, "now");
  tally(after, "after");
  return { byType, byCurve, byGuild, byBase, cuts: cuts.size, adds: adds.size, base: base.size, after: after.length };
}

export function CubeShape({ decisions, onOpenCards }: { decisions: Decisions; onOpenCards: (ids: string[]) => void }) {
  const shape = useMemo(() => shapeOf(decisions), [decisions]);
  const s = useMemo(() => summarize(decisions), [decisions]);

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
        {shape.base > 0 && (
          <p className="mt-1 text-sm text-(--color-text-dim)">
            <span className="text-violet-200">{shape.base} base</span> · {shape.after - shape.base} could still be cut
          </p>
        )}
        <p className="mt-1 text-xs text-(--color-text-dim)">
          Every number is the count after your cuts and adds, with the change from today beside it. Tap a number to open those cards.
        </p>
      </div>

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
