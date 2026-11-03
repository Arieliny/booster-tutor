// Types for _data-version.js (plain JS so the build script can use it too).
export interface DataVersion {
  builtAt?: string;
  cards?: { builtAt?: string; count?: number; total?: number | null } | null;
  cr?: { source?: string; effective?: string } | null;
}
export const MAX_AGE_DAYS: number;
export function scryfallTotal(): Promise<number>;
export function staleReasons(version: DataVersion | null, live: { total: number | null; crSource: string | null }, now: Date): string[];
