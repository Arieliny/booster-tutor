import { useEffect, useRef, useState } from "react";
import { checkFollowedCubes, hasChanges, type CubeCheck } from "../lib/cube-follow";
import { data } from "../lib/cube-review";
import { adminRebuild } from "../lib/auth";
import { shortDate } from "../lib/short-date";
import { useUpdateState, watchForUpdate } from "../lib/sw-update";
import { useAuth } from "../lib/auth-context";
import { Icon } from "./Icon";

type Rebuild = "idle" | "starting" | "rebuilding" | "waiting" | "failed" | "no-hook";

const REBUILD_TEXT: Record<Exclude<Rebuild, "idle" | "starting">, string> = {
  rebuilding:
    "Rebuilding now. In about 3 minutes “A new version is ready” shows at the top: tap Update and the changes are in.",
  waiting: "A rebuild already started in the last few minutes. The “new version” banner shows when it's ready.",
  failed: "Vercel didn't start the rebuild. Try again in a minute.",
  "no-hook": "This copy of the app can't start a rebuild (no deploy hook here).",
};

/**
 * My cube > "Check Cube Cobra" (Ari 2026-11-18): have the cubes I follow (mine, LSV, MTGO
 * Vintage, Arena Powered) changed since this version of the app was built? Lists what was
 * added and cut on each, and offers to rebuild the app so the changes (and their changelogs)
 * come in. The daily check does the same rebuild on its own within a day; this is "now".
 */
export function CubeCobraCheck() {
  const [checks, setChecks] = useState<CubeCheck[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [rebuild, setRebuild] = useState<Rebuild>("idle");
  const ac = useRef<AbortController | null>(null);
  const { waiting } = useUpdateState();
  // Only the owner can start a rebuild (api/admin.ts).
  const isOwner = useAuth().me?.role === "owner";

  useEffect(() => () => ac.current?.abort(), []);

  const check = async () => {
    ac.current?.abort();
    const ctl = new AbortController();
    ac.current = ctl;
    setChecking(true);
    setRebuild("idle");
    try {
      setChecks(await checkFollowedCubes(ctl.signal));
    } catch {
      // Aborted: the page closed.
    } finally {
      if (!ctl.signal.aborted) setChecking(false);
    }
  };

  const startRebuild = async () => {
    setRebuild("starting");
    try {
      const action = await adminRebuild();
      setRebuild(action === "hook-failed" ? "failed" : action);
      if (action === "rebuilding" || action === "waiting") watchForUpdate();
    } catch {
      setRebuild("failed");
    }
  };

  const changed = checks?.filter(hasChanges) ?? [];
  const built = shortDate(data.builtAt.slice(0, 10));

  return (
    <div className="space-y-3 p-3">
      <p className="text-xs text-(--color-text-dim)">
        This version has the cubes as of {built} · {data.cubes.lsv.label} updated {shortDate(data.cubes.lsv.updated)} ·{" "}
        {data.cubes.mtgo.label} {shortDate(data.cubes.mtgo.updated)} · {data.cubes.arena.label} {shortDate(data.cubes.arena.updated)}
      </p>

      <button
        type="button"
        onClick={check}
        disabled={checking}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-(--color-border) px-4 text-sm text-(--color-text) hover:bg-white/5 disabled:opacity-60"
      >
        <Icon name="refresh" className={"h-4 w-4 " + (checking ? "animate-spin" : "")} />
        {checking ? "Checking…" : checks ? "Check again" : "Check Cube Cobra"}
      </button>

      {checks && !checking && (
        <ul className="space-y-1.5" aria-label="What changed on Cube Cobra">
          {checks.map((c) => (
            <li key={c.key} className="min-w-0 text-sm">
              {"error" in c ? (
                <span className="text-(--color-text-dim)">
                  <span className="text-(--color-text)">{c.label}</span>: couldn't check ({c.error})
                </span>
              ) : hasChanges(c) ? (
                <details>
                  <summary className="cursor-pointer py-3.5 text-(--color-text)">
                    {c.label}: <span className="text-amber-300">{c.added.length} added, {c.removed.length} cut</span>
                  </summary>
                  <div className="mt-1 space-y-0.5 pl-4 text-xs">
                    {c.added.map((n) => (
                      <div key={"+" + n} className="text-emerald-300">
                        + {n}
                      </div>
                    ))}
                    {c.removed.map((n) => (
                      <div key={"-" + n} className="text-red-300">
                        − {n}
                      </div>
                    ))}
                  </div>
                </details>
              ) : (
                <span className="text-(--color-text)">
                  {c.label}: <span className="text-emerald-300">✓ no changes</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {checks && !checking && changed.length > 0 && isOwner && (
        <div className="space-y-2">
          {waiting && (rebuild === "rebuilding" || rebuild === "waiting") ? (
            <p role="status" className="text-sm text-(--color-text-dim)">
              Ready: tap Update at the top to bring the changes in.
            </p>
          ) : rebuild === "idle" || rebuild === "starting" ? (
            <button
              type="button"
              onClick={startRebuild}
              disabled={rebuild === "starting"}
              className="min-h-12 w-full rounded-lg bg-(--color-accent) px-4 text-sm font-medium text-(--color-accent-ink) hover:bg-(--color-accent-bright) disabled:opacity-60"
            >
              {rebuild === "starting" ? "Starting…" : "Bring these changes into the app"}
            </button>
          ) : (
            <p role="status" className="text-sm text-(--color-text-dim)">
              {REBUILD_TEXT[rebuild]}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
