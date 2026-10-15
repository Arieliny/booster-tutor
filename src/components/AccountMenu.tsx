import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../lib/auth-context";
import { AboutSheet } from "./Footer";

/** Avatar in the top bar: who's signed in, the owner's rarely-used tools, and sign out. */
export function AccountMenu({ onAdmin, onManageCubes }: { onAdmin: () => void; onManageCubes?: () => void }) {
  const { me, offline, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-(--color-accent)/20 text-sm font-semibold text-(--color-text) hover:bg-(--color-accent)/30"
      >
        {me.name.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-60 rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-1 text-sm shadow-xl">
          <div className="px-3 py-2">
            <div className="font-medium text-(--color-text)">{me.name}</div>
            <div className="text-xs text-(--color-text-dim)">
              {me.role === "owner" ? "Owner" : "Guest"}
              {offline && " · offline, using this device's saved sign-in"}
            </div>
          </div>
          {onManageCubes && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManageCubes();
              }}
              className="block w-full rounded px-3 py-2 text-left text-(--color-text) hover:bg-white/5"
            >
              Manage cubes
            </button>
          )}
          {me.role === "owner" && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAdmin();
              }}
              className="block w-full rounded px-3 py-2 text-left text-(--color-text) hover:bg-white/5"
            >
              People and access
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setAbout(true);
            }}
            className="block w-full rounded px-3 py-2 text-left text-(--color-text) hover:bg-white/5"
          >
            About
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="block w-full rounded px-3 py-2 text-left text-red-300 hover:bg-red-500/10"
          >
            Sign out of this device
          </button>
        </div>
      )}
      {/* At the page root: inside the sticky header it would sit under the bottom nav. */}
      {about && createPortal(<AboutSheet onClose={() => setAbout(false)} />, document.body)}
    </div>
  );
}
