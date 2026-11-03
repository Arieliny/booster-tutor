// Types for card-db-parts.mjs (plain JS so the build script can use it; tests import it too).
export function splitParts<T extends { id: string }>(
  cards: T[],
  partOf: (card: T) => string | undefined,
): { version: string; parts: { key: string; file: string; count: number; gz: number }[]; files: Map<string, string> };
