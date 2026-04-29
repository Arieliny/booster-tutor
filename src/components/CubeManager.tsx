import { useRef, useState } from "react";
import type { Cube, EnrichmentStatus } from "../types";
import { Modal } from "./Modal";
import { parseCubeList } from "../lib/cube-parser";
import { enrichCube } from "../lib/scryfall-enrich";
import { makeCubeId, saveCube, removeCube, uniqueCubeName } from "../lib/cube-store";

interface Props {
  cubes: Cube[];
  selectedId: string;
  onClose: () => void;
  onCubesChanged: (next: { cubes: Cube[]; selectedId: string }) => void;
}

export function CubeManager({ cubes, selectedId, onClose, onCubesChanged }: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const handleRename = async (cube: Cube, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === cube.name) {
      setRenamingId(null);
      return;
    }
    const final = await uniqueCubeName(trimmed);
    const updated = { ...cube, name: final };
    await saveCube(updated);
    onCubesChanged({
      cubes: cubes.map((c) => (c.id === cube.id ? updated : c)),
      selectedId,
    });
    setRenamingId(null);
  };

  const handleDelete = async (id: string) => {
    if (cubes.length <= 1) return;
    await removeCube(id);
    const next = cubes.filter((c) => c.id !== id);
    const nextSelected = selectedId === id ? next[0].id : selectedId;
    onCubesChanged({ cubes: next, selectedId: nextSelected });
    setConfirmDeleteId(null);
  };

  if (uploadOpen) {
    return (
      <CubeUploadModal
        onClose={() => setUploadOpen(false)}
        onUploaded={(cube) => {
          onCubesChanged({
            cubes: [...cubes, cube],
            selectedId: cube.id,
          });
          setUploadOpen(false);
        }}
      />
    );
  }

  if (confirmDeleteId) {
    const cube = cubes.find((c) => c.id === confirmDeleteId);
    return (
      <Modal onClose={() => setConfirmDeleteId(null)}>
        <h2 className="mb-2 text-lg font-medium text-(--color-text)">Delete cube?</h2>
        <p className="mb-4 text-(--color-text-dim)">
          <span className="text-(--color-text)">{cube?.name}</span> and its picked-cards
          history will be removed from this browser. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDeleteId(null)}
            className="rounded border border-(--color-border) px-4 py-2 text-sm text-(--color-text-dim) hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleDelete(confirmDeleteId)}
            className="rounded bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
          >
            Delete
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="text-lg font-medium text-(--color-text)">Manage cubes</h2>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="rounded bg-(--color-accent) px-3 py-1.5 text-sm font-medium text-black hover:bg-(--color-accent-bright)"
        >
          + Upload
        </button>
      </div>
      <ul className="space-y-2">
        {cubes.map((cube) => (
          <li
            key={cube.id}
            className="flex items-center justify-between gap-2 rounded border border-(--color-border) bg-black/30 p-3"
          >
            {renamingId === cube.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleRename(cube, renameValue)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename(cube, renameValue);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                className="flex-1 rounded bg-(--color-bg) px-2 py-1 text-sm text-(--color-text)"
              />
            ) : (
              <button
                type="button"
                className="flex-1 truncate text-left text-sm text-(--color-text) hover:text-(--color-accent)"
                onClick={() => {
                  setRenamingId(cube.id);
                  setRenameValue(cube.name);
                }}
                title="Click to rename"
              >
                <span className="truncate">{cube.name}</span>
                <span className="ml-2 text-xs text-(--color-text-dim)">
                  {cube.cards.length} cards
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmDeleteId(cube.id)}
              disabled={cubes.length <= 1}
              title={cubes.length <= 1 ? "Can't delete the only cube" : "Delete"}
              className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
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

// ---------------------------------------------------------------------------

function CubeUploadModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: (cube: Cube) => void;
}) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<EnrichmentStatus>({ kind: "idle" });
  const [savedCube, setSavedCube] = useState<Cube | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const t = await file.text();
    setText(t);
    if (!name) {
      const base = file.name.replace(/\.[^.]+$/, "");
      setName(base);
    }
  };

  const handleStart = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setStatus({ kind: "error", message: "Give the cube a name." });
      return;
    }
    if (!text.trim()) {
      setStatus({ kind: "error", message: "Paste a cube list or upload a file." });
      return;
    }

    const { parsed, unparseable } = parseCubeList(text);
    if (parsed.length === 0) {
      setStatus({ kind: "error", message: "No card lines found in input." });
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    setStatus({ kind: "running", done: 0, total: parsed.length, currentName: parsed[0].name });

    try {
      const result = await enrichCube(parsed, {
        signal: ac.signal,
        onProgress: ({ done, total, currentName }) =>
          setStatus({ kind: "running", done, total, currentName }),
      });

      const failures = [
        ...unparseable.map((l) => ({ line: l, reason: "Could not parse line" })),
        ...result.failures,
      ];

      if (result.cards.length === 0) {
        setStatus({
          kind: "error",
          message: "No cards could be looked up. Check the format.",
        });
        return;
      }

      const finalName = await uniqueCubeName(trimmedName);
      const cube: Cube = {
        id: makeCubeId(finalName),
        name: finalName,
        generated_at: new Date().toISOString(),
        cards: result.cards,
        failures: failures.length > 0 ? failures : undefined,
      };
      await saveCube(cube);
      setSavedCube(cube);
      setStatus({
        kind: "done",
        successes: result.cards.length,
        failures,
      });
      // No failures: auto-commit after a brief delay so the user sees the
      // success state. With failures: hold the modal open until they click
      // Continue, then commit + dismiss.
      if (failures.length === 0) {
        setTimeout(() => onUploaded(cube), 600);
      }
    } catch (err) {
      if ((err as DOMException).name === "AbortError") {
        setStatus({ kind: "idle" });
      } else {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    onClose();
  };

  const handleContinue = () => {
    if (savedCube) onUploaded(savedCube);
    else onClose();
  };

  if (status.kind === "running") {
    const pct = Math.round((status.done / Math.max(1, status.total)) * 100);
    return (
      <Modal onClose={handleCancel} persistent>
        <h2 className="mb-2 text-lg font-medium text-(--color-text)">
          Looking up cards on Scryfall…
        </h2>
        <p className="mb-3 text-sm text-(--color-text-dim)">
          {status.done} / {status.total} ({pct}%)
        </p>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-(--color-bg)">
          <div
            className="h-full bg-(--color-accent) transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mb-4 truncate text-xs text-(--color-text-dim)">
          {status.currentName || "…"}
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded border border-(--color-border) px-4 py-2 text-sm text-(--color-text-dim) hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </Modal>
    );
  }

  if (status.kind === "done" && status.failures.length > 0) {
    return (
      <Modal onClose={handleContinue} persistent>
        <h2 className="mb-2 text-lg font-medium text-(--color-text)">
          Cube uploaded with {status.failures.length}{" "}
          {status.failures.length === 1 ? "failure" : "failures"}
        </h2>
        <p className="mb-3 text-sm text-(--color-text-dim)">
          {status.successes} of {status.successes + status.failures.length} cards
          resolved. The cube is usable, but these lines couldn't be looked up:
        </p>
        <ul className="mb-4 max-h-60 overflow-auto rounded border border-(--color-border) bg-black/30 p-2 text-xs">
          {status.failures.map((f, i) => (
            <li key={i} className="border-b border-(--color-border) py-1 last:border-b-0">
              <div className="text-(--color-text)">{f.line}</div>
              <div className="text-(--color-text-dim)">{f.reason}</div>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleContinue}
            className="rounded bg-(--color-accent) px-4 py-2 text-sm font-medium text-black hover:bg-(--color-accent-bright)"
          >
            Continue
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 text-lg font-medium text-(--color-text)">Upload a cube</h2>

      <label className="mb-2 block text-xs uppercase tracking-wide text-(--color-text-dim)">
        Name
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My Cube"
        className="mb-3 w-full rounded border border-(--color-border) bg-(--color-bg) px-2 py-1.5 text-sm text-(--color-text)"
      />

      <label className="mb-2 block text-xs uppercase tracking-wide text-(--color-text-dim)">
        Cube list
      </label>
      <p className="mb-2 text-xs text-(--color-text-dim)">
        One card per line. Optionally specify a printing as <code>(SET) NUMBER</code>.
        If omitted, Scryfall picks the default English printing.
      </p>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded border border-(--color-border) px-3 py-1.5 text-xs text-(--color-text-dim) hover:bg-white/5"
        >
          Upload .txt file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <span className="text-xs text-(--color-text-dim)">or paste below</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"1 Black Lotus (LEB) 233\n1 Lightning Bolt"}
        className="mb-3 h-32 w-full resize-y rounded border border-(--color-border) bg-(--color-bg) px-2 py-1.5 font-mono text-xs text-(--color-text)"
      />

      {status.kind === "error" && (
        <p className="mb-3 rounded border border-red-700 bg-red-950/40 p-2 text-xs text-red-200">
          {status.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-(--color-border) px-4 py-2 text-sm text-(--color-text-dim) hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleStart}
          className="rounded bg-(--color-accent) px-4 py-2 text-sm font-medium text-black hover:bg-(--color-accent-bright)"
        >
          Look up & save
        </button>
      </div>
    </Modal>
  );
}
