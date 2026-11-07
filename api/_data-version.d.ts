// Types for _data-version.js (plain JS so the build script can use it too).
export interface DataVersion {
  builtAt?: string;
  cards?: { builtAt?: string; count?: number; total?: number | null; version?: string } | null;
  cr?: { source?: string; effective?: string } | null;
  /** The Cube Cobra cube "My cube" was built from: its id and listHash of its mainboard. */
  mine?: { cubeId?: string; hash?: string } | null;
}
export const MAX_AGE_DAYS: number;
export function scryfallTotal(waits?: number[]): Promise<number>;
export function listHash(ids: string[]): string;
export function cubeCobraOracleIds(cubeId: string): Promise<string[]>;
export function staleReasons(
  version: DataVersion | null,
  live: { total: number | null; crSource: string | null; mine?: string | null },
  now: Date,
): string[];
