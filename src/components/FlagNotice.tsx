import { useEffect, useRef, useState } from "react";
import { adminFlagCount } from "../lib/auth";

const MIN_GAP_MS = 5 * 60 * 1000;

/**
 * The owner's "a judge ruling was flagged" notice. Asks the server how many are
 * waiting when it appears (App only mounts it outside Admin, so coming back from
 * Admin counts again) and when the page becomes visible again, at most once every
 * five minutes. Offline or on any error it just stays quiet. "Later" hides it
 * until the next app open.
 */
export function FlagNotice({ onReview }: { onReview: () => void }) {
  const [count, setCount] = useState(0);
  const [hidden, setHidden] = useState(false);
  const lastAsk = useRef(0);

  useEffect(() => {
    let alive = true;
    const ask = (force: boolean) => {
      if (!force && Date.now() - lastAsk.current < MIN_GAP_MS) return;
      lastAsk.current = Date.now();
      adminFlagCount()
        .then((n) => alive && setCount(n))
        .catch(() => {
          // Offline or a server hiccup: say nothing, try again next time.
        });
    };
    ask(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") ask(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (hidden || count < 1) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-sm text-(--color-text)"
    >
      <span className="min-w-0 flex-1">
        {count === 1 ? "1 judge ruling flagged" : `${count} judge rulings flagged`} with “Looks wrong?”
      </span>
      <button
        type="button"
        onClick={() => setHidden(true)}
        className="min-h-12 shrink-0 rounded-lg px-3 text-sm text-(--color-text-dim) hover:bg-white/10"
      >
        Later
      </button>
      <button
        type="button"
        onClick={onReview}
        className="min-h-12 shrink-0 rounded-lg bg-(--color-accent) px-4 text-sm font-medium text-(--color-accent-ink) hover:bg-(--color-accent-bright)"
      >
        Review
      </button>
    </div>
  );
}
