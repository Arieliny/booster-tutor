import type { ParsedLine } from "../types";

/**
 * Parses a cube list (one card per line). Tolerates many formats:
 *
 *   1 Black Lotus (LEB) 233       <- name + count + set + collector
 *   1 Black Lotus                  <- name + count, no printing
 *   Black Lotus (LEB) 233          <- no count
 *   Black Lotus                    <- bare name
 *   1 "Name Sticker" Goblin (UNF) 107m   <- quoted name
 *   1 Aang, Swift Savior / Aang and La (TLA) 204   <- DFC slash
 *   1 Gleemox (PRM) 26584 *F*      <- foil annotation (ignored)
 *
 * Lines starting with `#` or `//` are treated as comments.
 * If the same card appears multiple times the parser yields one entry per copy
 * (we ignore counts > 1 for now — cube lists have count=1 per card).
 */
export function parseCubeList(text: string): {
  parsed: ParsedLine[];
  unparseable: string[];
} {
  const parsed: ParsedLine[] = [];
  const unparseable: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#") || line.startsWith("//")) continue;

    const result = parseSingleLine(line);
    if (result) parsed.push(result);
    else unparseable.push(line);
  }

  return { parsed, unparseable };
}

function parseSingleLine(line: string): ParsedLine | null {
  // Strip a leading "1 " or "2 " count, if present.
  let working = line.replace(/^(\d+)x?\s+/, "");

  // Try the full form first: NAME (SET) COLLECTOR [trailing junk]
  const fullMatch = working.match(/^(.+?)\s+\(([A-Za-z0-9]{2,6})\)\s+(\S+)/);
  if (fullMatch) {
    return {
      raw: line,
      name: fullMatch[1].trim(),
      set: fullMatch[2].toLowerCase(),
      collectorNumber: fullMatch[3].trim(),
    };
  }

  // Fall back to: NAME (no printing). Skip if line is gibberish.
  // Reject lines that are pure punctuation or extremely short.
  if (working.length < 2) return null;

  // Strip any trailing parenthesized junk like "(foil)" that wasn't a set code.
  working = working.replace(/\s+\([^)]*\)\s*$/, "").trim();
  if (!working) return null;

  return {
    raw: line,
    name: working,
    set: null,
    collectorNumber: null,
  };
}
