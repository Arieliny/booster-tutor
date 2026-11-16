import { dismissInstall, promptInstall, useInstall } from "../lib/install";

/**
 * "Add LifeTutor to your home screen". Shown only where it can help: Chrome
 * gave us an install prompt, or this is iPhone/iPad Safari (instructions only).
 * Hidden once installed, and for 30 days after "Not now".
 */
export function InstallCard({ className = "" }: { className?: string }) {
  const { canInstall, installed, isIos, dismissed } = useInstall();
  if (installed || dismissed || (!canInstall && !isIos)) return null;
  return (
    <div
      role="status"
      className={
        "flex w-full items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-bg-elev) px-3 py-2 text-left text-sm text-(--color-text) " +
        className
      }
    >
      <div className="min-w-0 flex-1 py-1">
        <div className="font-medium">Add LifeTutor to your home screen</div>
        <p className="text-(--color-text-dim)">
          It opens full screen and works with no signal.
          {!canInstall && isIos && " In Safari, tap Share, then Add to Home Screen."}
        </p>
      </div>
      <button
        type="button"
        onClick={dismissInstall}
        className="min-h-12 shrink-0 rounded-lg px-3 text-sm text-(--color-text-dim) hover:bg-white/10"
      >
        Not now
      </button>
      {canInstall && (
        <button
          type="button"
          onClick={() => void promptInstall()}
          className="min-h-12 shrink-0 rounded-lg bg-(--color-accent) px-4 text-sm font-medium text-(--color-accent-ink) hover:bg-(--color-accent-bright)"
        >
          Add
        </button>
      )}
    </div>
  );
}
