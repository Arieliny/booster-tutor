import { useEffect, useState } from "react";
import { cubeCobraDrift, type CubeCobraDrift } from "../lib/cubecobra";
import type { Cube } from "../types";

type Check =
  | { kind: "checking" }
  | { kind: "done"; drift: CubeCobraDrift }
  // Offline, or Cube Cobra unreachable: say nothing rather than guess.
  | { kind: "unknown" };

/**
 * Results per cube copy, for the life of the page — so switching tabs doesn't
 * refetch. Keyed on generated_at too, so a Refresh (which re-stamps it)
 * triggers a fresh check.
 */
const cache = new Map<string, CubeCobraDrift>();
const keyFor = (cube: Cube) => `${cube.id}|${cube.cubecobraId}|${cube.generated_at}`;

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * One line under the cube picker for cubes imported from Cube Cobra: when this
 * copy was taken, and whether Cube Cobra's list has changed since. The library
 * holds a copy — nothing updates on its own — so this says when Refresh is due.
 */
export function CubeCobraStatus({ cube, onRefresh }: { cube: Cube; onRefresh: () => void }) {
  const key = keyFor(cube);
  const [result, setResult] = useState<{ key: string; check: Check } | null>(null);

  const cached = cache.get(key);
  const check: Check = cached
    ? { kind: "done", drift: cached }
    : result?.key === key
      ? result.check
      : { kind: "checking" };

  useEffect(() => {
    if (cache.has(key)) return;
    const ac = new AbortController();
    cubeCobraDrift(cube, ac.signal)
      .then((drift) => {
        cache.set(key, drift);
        setResult({ key, check: { kind: "done", drift } });
      })
      .catch(() => {
        if (!ac.signal.aborted) setResult({ key, check: { kind: "unknown" } });
      });
    return () => ac.abort();
    // `key` captures everything about `cube` the check depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const copied = shortDate(cube.generated_at);
  const changes = check.kind === "done" ? check.drift.added.length + check.drift.removed.length : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-(--color-text-dim)">
      <span>Cube Cobra copy{copied && ` from ${copied}`}</span>
      {check.kind === "checking" && <span>· checking…</span>}
      {check.kind === "done" && changes === 0 && <span className="text-emerald-300">· ✓ up to date</span>}
      {check.kind === "done" && changes > 0 && (
        <>
          <span
            className="text-amber-300"
            title={[
              ...check.drift.added.slice(0, 12).map((n) => `+ ${n}`),
              ...check.drift.removed.slice(0, 12).map((n) => `− ${n}`),
            ].join("\n")}
          >
            · ⚠ Cube Cobra has {check.drift.added.length} added, {check.drift.removed.length} cut
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded border border-amber-400/50 px-1.5 py-0.5 text-amber-200 hover:bg-amber-400/10"
          >
            Refresh
          </button>
        </>
      )}
    </div>
  );
}
