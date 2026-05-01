import { useState } from "react";
import { Modal } from "./Modal";
import {
  clearSyncCode,
  generateSyncCode,
  getSyncCode,
  setSyncCode,
} from "../lib/sync";

interface Props {
  onClose: () => void;
}

export function SyncSettings({ onClose }: Props) {
  const [code, setCodeState] = useState<string | null>(getSyncCode());
  const [connectInput, setConnectInput] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [pendingNewCode, setPendingNewCode] = useState<string | null>(null);

  const handleGenerate = () => {
    const next = generateSyncCode();
    setSyncCode(next);
    setCodeState(next);
    setPendingNewCode(next);
    setConfirmReload(true);
  };

  const handleConnect = () => {
    setConnectError(null);
    const trimmed = connectInput.trim();
    const ok = setSyncCode(trimmed);
    if (!ok) {
      setConnectError("Codes are 6–16 letters/digits.");
      return;
    }
    setCodeState(ok);
    setPendingNewCode(ok);
    setConfirmReload(true);
  };

  const handleDisconnect = () => {
    clearSyncCode();
    setCodeState(null);
    setConfirmDisconnect(false);
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available; fall back silently.
    }
  };

  if (confirmReload && pendingNewCode) {
    return (
      <Modal onClose={() => {}} persistent>
        <h2 className="mb-2 text-lg font-medium text-(--color-text)">
          Reload to sync?
        </h2>
        <p className="mb-4 text-(--color-text-dim)">
          The app needs to reload to merge cloud data with what's on this device.
          Your local cubes and inventory will be preserved and pushed to the
          cloud (last write wins on conflicts).
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setConfirmReload(false);
              setPendingNewCode(null);
            }}
            className="rounded border border-(--color-border) px-4 py-2 text-sm text-(--color-text-dim) hover:bg-white/5"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded bg-(--color-accent) px-4 py-2 text-sm font-medium text-black hover:bg-(--color-accent-bright)"
          >
            Reload now
          </button>
        </div>
      </Modal>
    );
  }

  if (confirmDisconnect) {
    return (
      <Modal onClose={() => setConfirmDisconnect(false)}>
        <h2 className="mb-2 text-lg font-medium text-(--color-text)">
          Disconnect cloud sync?
        </h2>
        <p className="mb-4 text-(--color-text-dim)">
          Your data on this device stays put, but changes won't propagate to or
          from your other devices. You can reconnect later by entering the same
          sync code.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDisconnect(false)}
            className="rounded border border-(--color-border) px-4 py-2 text-sm text-(--color-text-dim) hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            className="rounded bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
          >
            Disconnect
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 text-lg font-medium text-(--color-text)">Cloud sync</h2>
      <p className="mb-4 text-sm text-(--color-text-dim)">
        Sync your cubes and inventory across devices. No accounts — just a code
        you copy between browsers.
      </p>

      {code ? (
        <>
          <div className="mb-3 rounded-lg border border-(--color-accent)/40 bg-(--color-accent)/5 p-4">
            <div className="mb-1 text-xs uppercase tracking-wide text-(--color-text-dim)">
              Synced as
            </div>
            <div className="flex items-center gap-2">
              <code className="select-all rounded bg-(--color-bg) px-3 py-1.5 font-mono text-base text-(--color-text)">
                {code}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded border border-(--color-border) px-3 py-1.5 text-xs text-(--color-text-dim) hover:bg-white/5"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-xs text-(--color-text-dim)">
              Copy this code, then in another browser open Settings → Cloud sync
              and enter it under "Connect to existing".
            </p>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setConfirmDisconnect(true)}
              className="rounded border border-(--color-border) px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10"
            >
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 rounded-lg border border-(--color-border) bg-black/30 p-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-(--color-text-dim)">
              First device
            </div>
            <p className="mb-3 text-sm text-(--color-text-dim)">
              Generate a fresh code. Your cubes and inventory will start syncing
              to the cloud.
            </p>
            <button
              type="button"
              onClick={handleGenerate}
              className="rounded bg-(--color-accent) px-4 py-2 text-sm font-medium text-black hover:bg-(--color-accent-bright)"
            >
              Generate sync code
            </button>
          </div>
          <div className="rounded-lg border border-(--color-border) bg-black/30 p-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-(--color-text-dim)">
              Connect to existing
            </div>
            <p className="mb-3 text-sm text-(--color-text-dim)">
              Already have a code from another device? Enter it here.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={connectInput}
                onChange={(e) => setConnectInput(e.target.value)}
                placeholder="abc123…"
                className="flex-1 rounded border border-(--color-border) bg-(--color-bg) px-3 py-1.5 font-mono text-sm text-(--color-text) placeholder:text-(--color-text-dim)"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={handleConnect}
                disabled={!connectInput.trim()}
                className="rounded border border-(--color-border) px-4 py-2 text-sm text-(--color-text) hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Connect
              </button>
            </div>
            {connectError && (
              <p className="mt-2 text-xs text-red-300">{connectError}</p>
            )}
          </div>
        </>
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
