// Plain JS (not TS) so both the build script (scripts/fetch-cr.mjs) and the
// judge function can use it. Mirrors the mtg-judge skill's CR parsing.

const RULES_PAGE = "https://magic.wizards.com/en/rules";

/** The current CR .txt link, found on Wizards' rules page. */
export async function crUrl() {
  const res = await fetch(RULES_PAGE);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${RULES_PAGE}`);
  const html = await res.text();
  const link = html.match(/https?:\/\/media\.wizards\.com\/[^"'<>]*?CompRules[^"'<>]*?\.txt/)?.[0];
  if (!link) throw new Error("no CR .txt link on the rules page");
  return link.replace(/ /g, "%20");
}

/** The CR has shipped as UTF-8 and as Windows-1252 over the years. */
export function decodeCr(buf) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

/**
 * @param {string} text  the CR .txt
 * @param {string} source where it came from
 * @returns {{effective: string, source: string, fetched: string,
 *   rules: Record<string,string>, sections: Record<string,string>, glossary: Record<string,string>}}
 */
export function parseCr(text, source) {
  const lines = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
  const lastIndex = (word) => lines.reduce((at, l, i) => (l === word ? i : at), -1);
  const gl = lastIndex("Glossary") === -1 ? lines.length : lastIndex("Glossary");
  const credIdx = lastIndex("Credits");
  const cred = credIdx > gl ? credIdx : lines.length;

  const ruleRe = /^(\d{3}\.\d+[a-z]?)\.?\s+(.*)$/;
  const headRe = /^(\d{1,3})\.\s+(\S.*)$/;
  const rules = {};
  const sections = {};
  let cur = null;
  for (const l of lines.slice(0, gl)) {
    const m = l.match(ruleRe);
    if (m) {
      cur = m[1];
      rules[cur] = m[2];
      continue;
    }
    const h = l.match(headRe);
    if (h) {
      sections[h[1]] = h[2];
      cur = null;
    } else if (l && cur) {
      rules[cur] += "\n    " + l;
    }
  }

  const glossary = {};
  let block = [];
  for (const l of [...lines.slice(gl + 1, cred), ""]) {
    if (l) block.push(l);
    else if (block.length) {
      glossary[block[0]] = block.slice(1).join(" ");
      block = [];
    }
  }

  const eff = text.match(/effective as of ([A-Z][a-z]+ \d{1,2}, \d{4})/);
  return { effective: eff ? eff[1] : "unknown", source, fetched: new Date().toISOString(), rules, sections, glossary };
}
