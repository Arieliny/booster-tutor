/**
 * What Commit changes puts on Cube Cobra and Moxfield, and how (pure logic, so
 * it's testable without the cube data):
 *  - Scope: every Add / Cut decision, or only the cards ticked on a checklist
 *    (Ari commits what has physically arrived or come out of the box; an
 *    unticked card waits for next time).
 *  - Real or proxy: the powered Moxfield deck tags every card #CUBE plus #REAL
 *    or #PROXY. A guess from the orders, which Ari can flip per card.
 *  - The lines for the powered deck's Bulk Edit, and a ready request for Claude
 *    (CubeOrdering's "Committing cube changes.md" has the steps it follows).
 */
import { nameKey, type Checklist, type Mark } from "./checklists";

export type CopyTag = "REAL" | "PROXY";

/** Ari's "Powered Cube" deck on Moxfield: mirrors the Cube Cobra mainboard, cuts go to its Sideboard. */
export const POWERED_MOXFIELD = "https://moxfield.com/decks/xcLr00dq1U2O615ysK0c1A";

export interface Scope {
  /** In the commit. */
  adds: string[];
  cuts: string[];
  /** Decided but not ticked yet, so left out. */
  addsWaiting: string[];
  cutsWaiting: string[];
}

/**
 * The adds and cuts ticked "got it" on a checklist. An add counts when it's
 * ticked on a "Coming in" checklist or on a pasted list (an order) that has it;
 * a cut when it's ticked on a "Going out" checklist or a pasted list. Ticks on
 * other checklists (the cube as it is, maybes) don't count, and a card flagged
 * with a problem isn't ticked.
 */
export function tickedScope(
  addIds: string[],
  cutIds: string[],
  lists: Checklist[],
  marks: Record<string, Record<string, Mark>>,
  nameOf: (id: string) => string,
): Scope {
  const ticked = (id: string, which: "add" | "cut") =>
    lists.some((l) => {
      const m = marks[l.id] ?? {};
      if (l.source.kind === "review") return l.source.which === which && m[id] === 1;
      const k = nameKey(nameOf(id));
      return m[k] === 1 && l.source.names.some((n) => nameKey(n) === k);
    });
  const split = (ids: string[], which: "add" | "cut") => [ids.filter((id) => ticked(id, which)), ids.filter((id) => !ticked(id, which))];
  const [adds, addsWaiting] = split(addIds, "add");
  const [cuts, cutsWaiting] = split(cutIds, "cut");
  return { adds, cuts, addsWaiting, cutsWaiting };
}

/** Whether there's a checklist that ticks adds or cuts at all (then ticked-only is the sensible default). */
export function hasCommitChecklist(lists: Checklist[]): boolean {
  return lists.some((l) => l.source.kind === "review" && (l.source.which === "add" || l.source.which === "cut"));
}

/** What a pasted list (an order file) says about a card: where it comes from and the printing. */
export function orderDetail(name: string, lists: Checklist[]): { from?: string; printing?: string } {
  const k = nameKey(name);
  const out: { from?: string; printing?: string } = {};
  for (const l of lists) {
    if (l.source.kind !== "names") continue;
    const d = l.source.details?.[k];
    if (d?.from && !out.from) out.from = d.from;
    if (d?.printing && !out.printing) out.printing = d.printing;
  }
  return out;
}

const PROXY_SOURCE = /\bmpc\b|proxy/i;

/**
 * Real copy or proxy, and why:
 *  1. what Ari set for this card (he opened one, or bought one over a proxy);
 *  2. where an order list says it comes from (a store or friend = real, MPC = proxy);
 *  3. a proxy order it was printed in (the card's `owned`, from the MPC files);
 *  4. otherwise real: it isn't in any proxy order, so it's a copy he has.
 */
export function copyKind(owned: string[] | undefined, from: string | undefined, override: CopyTag | undefined): { tag: CopyTag; why: string } {
  if (override) return { tag: override, why: "you set it" };
  if (from) return { tag: PROXY_SOURCE.test(from) ? "PROXY" : "REAL", why: from };
  if (owned?.length) return { tag: "PROXY", why: owned.join(", ") };
  return { tag: "REAL", why: "not in a proxy order" };
}

/** One Bulk Edit line for the powered deck: "1 Name (SET) 123 #CUBE #REAL". */
export function poweredLine(name: string, set: string, collectorNumber: string, tag: CopyTag): string {
  return `1 ${name} (${set.toUpperCase()}) ${collectorNumber} #CUBE #${tag}`;
}

export interface RequestAdd {
  name: string;
  set: string;
  collectorNumber: string;
  tag: CopyTag;
  why: string;
  /** The printing of Ari's real copy, when an order list says. */
  has?: string;
}
export interface RequestCut {
  name: string;
  /** Its printing on Cube Cobra now, when known. */
  set?: string;
  collectorNumber?: string;
}

/** A ready-to-paste request for Claude, following CubeOrdering's runbook. */
export function claudeRequest(o: {
  cubeId: string;
  before: number;
  after: number;
  adds: RequestAdd[];
  cuts: RequestCut[];
  waiting: string[];
  moxfield: string;
}): string {
  const out = [
    "Please commit these powered-cube changes to Cube Cobra and Moxfield, following CubeOrdering/Committing cube changes.md.",
    "",
    `Cube Cobra: ${o.cubeId}, ${o.before} -> ${o.after} cards.`,
    `Moxfield: Powered Cube (${o.moxfield}). Cuts go to its Sideboard with their printing and tags.`,
  ];
  if (o.adds.length) {
    out.push("", `Add (${o.adds.length}):`);
    for (const a of o.adds) {
      const has = a.has ? `, my copy is ${a.has}` : "";
      out.push(`- ${a.name}: Cube Cobra ${a.set.toLowerCase()}|${a.collectorNumber}; Moxfield #${a.tag} (${a.why}${has})`);
    }
  }
  if (o.cuts.length) {
    out.push("", `Cut (${o.cuts.length}):`);
    for (const c of o.cuts) out.push(`- ${c.name}${c.set ? ` (on Cube Cobra as ${c.set.toUpperCase()} ${c.collectorNumber})` : ""}`);
  }
  if (o.waiting.length) out.push("", `Not ticked yet, so leave these out: ${o.waiting.join(", ")}.`);
  out.push("", "Booster Tutor already has these decisions. Check both sites after saving and tell me the counts.");
  return out.join("\n");
}
