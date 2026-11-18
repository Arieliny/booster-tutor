import { applyUpdate, updateLater, useUpdateState } from "../lib/sw-update";

/**
 * "A new version is ready · Update · Later" (lib/sw-update.ts). Renders nothing
 * until a deploy has downloaded and is waiting, and nothing after "Later".
 */
export function UpdateBanner({ className = "" }: { className?: string }) {
  const { waiting, later, updating } = useUpdateState();
  if (!waiting || later) return null;
  return (
    <div
      role="status"
      data-checked="2026-11-18"
      className={
        "flex items-center gap-2 rounded-xl border border-(--color-accent)/50 bg-(--color-accent)/15 px-3 py-1.5 text-sm text-(--color-text) " + className
      }
    >
      <span className="min-w-0 flex-1">A new version is ready.</span>
      <button
        type="button"
        onClick={updateLater}
        disabled={updating}
        className="min-h-12 shrink-0 rounded-lg px-3 text-sm text-(--color-text-dim) hover:bg-white/10 disabled:opacity-40"
      >
        Later
      </button>
      <button
        type="button"
        onClick={applyUpdate}
        disabled={updating}
        className="min-h-12 shrink-0 rounded-lg bg-(--color-accent) px-4 text-sm font-medium text-(--color-accent-ink) hover:bg-(--color-accent-bright) disabled:opacity-60"
      >
        {updating ? "Updating…" : "Update"}
      </button>
    </div>
  );
}
