import { useEffect } from "react";
import { Icon } from "./Icon";
import { useBackToClose } from "../lib/use-back-to-close";

/**
 * A panel that slides up from the bottom on a phone and sits on the right on
 * a laptop. Render it only while open. Back, Esc, ✕ or tapping outside close it.
 */
export function Sheet({
  title,
  onClose,
  action,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Small control next to the title, e.g. "Clear all". */
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  useBackToClose(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // h-dvh rather than inset-0: on a phone, Chrome sizes inset-0 to the screen
    // with the address bar showing, which leaves the bottom nav peeking out.
    <div className="fixed inset-x-0 top-0 z-50 flex h-dvh items-end md:items-stretch md:justify-end print:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[85vh] w-full flex-col rounded-t-2xl border-t border-(--color-border) bg-(--color-bg-elev) md:h-full md:max-h-none md:w-96 md:rounded-none md:border-t-0 md:border-l"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-(--color-border) md:hidden" />
        <div className="flex shrink-0 items-center gap-3 px-4 pt-2 pb-2 md:pt-4">
          <h2 className="flex-1 text-base font-semibold text-(--color-text)">{title}</h2>
          {action}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 rounded p-2 text-(--color-text-dim) hover:bg-white/5"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-(--color-border) p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
