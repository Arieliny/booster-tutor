import { useState } from "react";
import { Modal } from "./Modal";
import {
  clearEditPassword,
  hasEditPassword,
  verifyEditPassword,
} from "../lib/sync";

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Unlock panel for the shared cube library. Anyone can read the library;
 * changing it needs the edit password (checked server-side).
 */
export function EditAccess({ onClose, onChanged }: Props) {
  const [unlocked, setUnlocked] = useState(hasEditPassword());
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);

  const handleUnlock = async () => {
    const pw = input.trim();
    if (!pw) {
      setError("Enter the edit password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyEditPassword(pw);
      if (!ok) {
        setError("That password wasn't accepted.");
        return;
      }
      setUnlocked(true);
      setJustUnlocked(true);
      setInput("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLock = () => {
    clearEditPassword();
    setUnlocked(false);
    setJustUnlocked(false);
    onChanged();
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 text-lg font-medium text-(--color-text)">
        Shared cube library
      </h2>
      <p className="mb-4 text-sm text-(--color-text-dim)">
        Everyone who opens Booster Tutor sees the same cubes, and they're stored
        in the cloud — so they survive clearing your browser. Opening packs and
        drafting are always available to anyone and stay on their own device.
        Changing the library needs the edit password.
      </p>

      {unlocked ? (
        <>
          <div className="mb-3 rounded-lg border border-(--color-accent)/40 bg-(--color-accent)/5 p-4">
            <div className="text-sm font-medium text-(--color-accent)">
              Editing unlocked
            </div>
            <p className="mt-1 text-xs text-(--color-text-dim)">
              You can add, refresh, rename and archive cubes on this device.
            </p>
          </div>

          {justUnlocked && (
            <div className="mb-3 rounded-lg border border-(--color-border) bg-black/30 p-3 text-xs text-(--color-text-dim)">
              If this device has cubes that aren't in the shared library yet,
              reload to upload them.
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="ml-2 rounded border border-(--color-border) px-2 py-1 text-xs text-(--color-text) hover:bg-white/5"
              >
                Reload &amp; upload
              </button>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleLock}
              className="rounded border border-(--color-border) px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10"
            >
              Lock editing
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-(--color-border) bg-black/30 p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-(--color-text-dim)">
            Edit password
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleUnlock();
              }}
              placeholder="••••••••"
              className="flex-1 rounded border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm text-(--color-text)"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={handleUnlock}
              disabled={busy || !input.trim()}
              className="rounded bg-(--color-accent) px-4 py-2 text-sm font-medium text-black hover:bg-(--color-accent-bright) disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Checking…" : "Unlock"}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
          <p className="mt-3 text-xs text-(--color-text-dim)">
            Stored on this device so you stay unlocked. Not an account — it's one
            shared password that guards the cube list.
          </p>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-(--color-border) px-4 py-2 text-sm text-(--color-text-dim) hover:bg-white/5"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}
