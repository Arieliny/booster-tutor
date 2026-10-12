import { useSyncStatus } from "../lib/use-sync-status";
import { Icon } from "./Icon";

/** Whether this device's Cube review data is on the server yet. */
export function SyncChip() {
  const s = useSyncStatus();
  const tone =
    s.state === "synced" && !s.pending
      ? "bg-emerald-500/15 text-emerald-300"
      : s.state === "offline"
        ? "bg-amber-500/15 text-amber-300"
        : s.state === "error"
          ? "bg-red-500/15 text-red-300"
          : "bg-white/5 text-(--color-text-dim)";
  const label =
    s.state === "synced"
      ? s.pending
        ? `Syncing ${s.pending}…`
        : "Synced"
      : s.state === "offline"
        ? s.pending
          ? `Offline · ${s.pending} to sync`
          : "Offline"
        : s.state === "error"
          ? "Sync problem"
          : "Syncing…";
  return (
    <span
      className={"inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs " + tone}
      title={s.message ?? (s.lastSynced ? `Last synced ${new Date(s.lastSynced).toLocaleTimeString()}` : undefined)}
    >
      {s.state === "synced" && !s.pending && <Icon name="check" className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}
