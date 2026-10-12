import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { crUrl, decodeCr, parseCr } from "./_cr-parse.js";

/**
 * The Comprehensive Rules for the judge, and the lookups it can make - the
 * same ones as the mtg-judge skill's helper (rule numbers with subrules, rules
 * plus what they cross-reference, glossary terms, keyword search).
 *
 * Loaded from data/cr.json (written at build time by scripts/fetch-cr.mjs);
 * if that's missing, fetched from Wizards once per warm function.
 */

export interface Cr {
  effective: string;
  source: string;
  fetched: string;
  rules: Record<string, string>;
  sections: Record<string, string>;
  glossary: Record<string, string>;
}

let loading: Promise<Cr | null> | null = null;

export function loadCr(): Promise<Cr | null> {
  loading ??= (async () => {
    try {
      return JSON.parse(await readFile(join(process.cwd(), "data", "cr.json"), "utf8")) as Cr;
    } catch {
      try {
        const url = await crUrl();
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return parseCr(decodeCr(await res.arrayBuffer()), url) as Cr;
      } catch (err) {
        console.error("CR unavailable:", err);
        loading = null; // try again on the next question
        return null;
      }
    }
  })();
  return loading;
}

/** "603" -> every 603.x; "603.3" -> 603.3, 603.3a, 603.3b... */
function children(rules: Record<string, string>, num: string): string[] {
  if (/^\d{3}$/.test(num)) return Object.keys(rules).filter((k) => k.startsWith(num + ".")).sort(byRule);
  return Object.keys(rules)
    .filter((k) => k === num || (k.startsWith(num) && /^[a-z]$/.test(k.slice(num.length))))
    .sort(byRule);
}

function byRule(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

/** Rule numbers from "603.3, 704.5 613" (commas and/or spaces). */
export function numsList(input: string[] | string | undefined): string[] {
  const parts = (Array.isArray(input) ? input : [input ?? ""]).flatMap((s) => String(s).split(/[,\s]+/));
  return [...new Set(parts.map((p) => p.trim().replace(/\.$/, "")).filter(Boolean))];
}

export function ruleChunks(cr: Cr, nums: string[]): string[] {
  const out: string[] = [];
  for (const n of nums) {
    if (/^\d{3}$/.test(n) && cr.sections[n]) out.push(`## ${n}. ${cr.sections[n]}`);
    const keys = children(cr.rules, n);
    out.push(...(keys.length ? keys.map((k) => `${k} ${cr.rules[k]}`) : [`(no rule ${n} in this CR - check the number)`]));
  }
  return out;
}

export function refsChunks(cr: Cr, nums: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of nums) {
    const keys = children(cr.rules, n);
    if (!keys.length) {
      out.push(`(no rule ${n} in this CR - check the number)`);
      continue;
    }
    keys.forEach((k) => seen.add(k));
    out.push(...keys.map((k) => `${k} ${cr.rules[k]}`));
  }
  // Cross-references come after every rule asked for, so none is demoted to a "->" line.
  for (const n of nums) {
    for (const k of children(cr.rules, n)) {
      for (const ref of cr.rules[k].match(/\b\d{3}\.\d+[a-z]?\b/g) ?? []) {
        if (!seen.has(ref) && cr.rules[ref]) {
          seen.add(ref);
          out.push(`-> ${ref} ${cr.rules[ref]}`);
        }
      }
    }
  }
  return out;
}

export function glossChunks(cr: Cr, terms: string[]): string[] {
  const keys = Object.keys(cr.glossary);
  return terms.flatMap((t) => {
    const low = t.toLowerCase();
    const hits =
      [keys.filter((k) => k.toLowerCase() === low), keys.filter((k) => k.toLowerCase().startsWith(low)), keys.filter((k) => k.toLowerCase().includes(low))].find(
        (h) => h.length,
      ) ?? [];
    return hits.length ? hits.slice(0, 3).map((k) => `[${k}] ${cr.glossary[k]}`) : [`(no glossary entry for '${t}')`];
  });
}

const STOP = new Set("a an the of to in on and or is it be as at by for with this that when if do does can what how".split(" "));

export function searchChunks(cr: Cr, query: string, top = 12): string[] {
  const q = query.toLowerCase();
  const terms = (q.match(/[a-z0-9'+/-]+/g) ?? []).filter((t) => !STOP.has(t) && t.length > 1);
  if (!terms.length) return ["Give some keywords."];
  const need = Math.max(1, Math.ceil(terms.length / 2));
  const score = (text: string) => {
    const t = text.toLowerCase();
    const hits = terms.map((w) => Math.min(t.split(w).length - 1, 3));
    const matched = hits.filter(Boolean).length;
    return matched < need ? 0 : matched * 10 + hits.reduce((a, b) => a + b, 0) + (t.includes(q) ? 15 : 0);
  };
  const short = (v: string) => {
    const flat = v.replace(/\n {4}/g, " ");
    return flat.length > 220 ? flat.slice(0, 220) + "..." : flat;
  };
  const ranked = Object.entries(cr.rules)
    .map(([k, v]) => [score(v), k, v] as const)
    .filter((r) => r[0] > 0)
    .sort((a, b) => b[0] - a[0] || byRule(a[1], b[1]))
    .slice(0, top);
  const granked = Object.entries(cr.glossary)
    .map(([k, v]) => [score(k + " " + v) + (k.toLowerCase() === q ? 30 : 0), k, v] as const)
    .filter((g) => g[0] > 0)
    .sort((a, b) => b[0] - a[0])
    .slice(0, 4);
  return [
    granked.length ? "Glossary:" : "Glossary: no match",
    ...granked.map(([, k, v]) => `  [${k}] ${short(v)}`),
    ranked.length ? "Rules:" : "Rules: no match - try a synonym",
    ...ranked.map(([, k, v]) => `  ${k}  ${short(v)}`),
  ];
}
