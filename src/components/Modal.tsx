import { useEffect } from "react";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  onClose: () => void;
  /** If true, clicking the backdrop won't close. Default false. */
  persistent?: boolean;
}

export function Modal({ children, onClose, persistent }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !persistent) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, persistent]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={persistent ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
