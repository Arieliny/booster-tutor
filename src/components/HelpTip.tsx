import { useEffect, useRef, useState } from "react";

interface Props {
  text: string;
  /** Accessible label for the trigger button. */
  label?: string;
}

/**
 * A tap-friendly tooltip. Native `title=""` attributes don't open on touch
 * devices, so we render a "?" button that toggles a small popover.
 */
export function HelpTip({ text, label = "Help" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClickAway);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClickAway);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((s) => !s);
        }}
        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-(--color-border) text-xs text-(--color-text-dim) hover:border-(--color-accent) hover:text-(--color-accent)"
      >
        ?
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-7 z-30 w-64 rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-3 text-xs leading-relaxed text-(--color-text) shadow-xl"
        >
          {text}
        </div>
      )}
    </div>
  );
}
