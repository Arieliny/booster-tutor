import { useRef, useState } from "react";
import type { Cube, ParseFailure } from "../types";
import {
  diffCards,
  importFromCubeCobra,
  parseCubeCobraId,
} from "../lib/cubecobra";
import { makeCubeId, saveCube, uniqueCubeName } from "../lib/cube-store";
import { Modal } from "./Modal";

export type CubeCobraMode =
  | { kind: "create" }
  /** Re-pull an existing cube in place, keeping its id and name. */
  | { kind: "refresh"; cube: Cube };

interface Props {
  mode: CubeCobraMode;
  onClose: () => void;
  onDone: (cube: Cube) => void;
}

type Status =
  | { kind: "input" }
  | { kind: "fetching" }
  | { kind: "running"; done: number; total: number }
  | {
      kind: "done";
      cube: Cube;
      failures: ParseFailure[];
      duplicatesSkipped: number;
      diff?: { added: number; removed: number };
    }
  | { kind: "error"; message: string };

export function CubeCobraImport({ mode, onClose, onDone }: Props) {
  const isRefresh = mode.kind === "refresh";
  const [source, setSource] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "input" });
  const abortRef = useRef<AbortController | null>(null);

  const run = async (cubecobraId: string) => {
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus({ kind: "fetching" });

    try {
      const result = await importFromCubeCobra(cubecobraId, {
        signal: ac.signal,
        onProgress: ({ done, total }) => setStatus({ kind: "running", done, total }),
      });

      if (result.cards.length === 0) {
        setStatus({
          kind: "error",
          message: "None of that cube's cards could be resolved on Scryfall.",
        });
        return;
      }

      const failures = result.failures;
      let cube: Cube;
      let diff: { added: number; removed: number } | undefined;

      if (mode.kind === "refresh") {
        diff = diffCards(mode.cube.cards, result.cards);
        cube = {
          ...mode.cube,
          cards: result.cards,
          generated_at: new Date().toISOString(),
          cubecobraId: result.cubecobraId,
          failures: failures.length > 0 ? failures : undefined,
        };
      } else {
        const desired = name.trim() || result.name;
        const finalName = await uniqueCubeName(desired);
        cube = {
          id: makeCubeId(finalName),
          name: finalName,
          generated_at: new Date().toISOString(),
          cards: result.cards,
          cubecobraId: result.cubecobraId,
          failures: failures.length > 0 ? failures : undefined,
        };
      }

      await saveCube(cube);
      setStatus({
        kind: "done",
        cube,
        failures,
        duplicatesSkipped: result.duplicatesSkipped,
        diff,
      });

      // Clean first-time import: nothing to report, so commit automatically.
      if (!isRefresh && failures.length === 0 && result.duplicatesSkipped === 0) {
        setTimeout(() => onDone(cube), 600);
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        setStatus({ kind: "input" });
        return;
      }
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleStart = () => {
    if (mode.kind === "refresh") {
      const id = mode.cube.cubecobraId;
      if (!id) {
        setStatus({ kind: "error", message: "This cube has no CubeCobra link." });
        return;
      }
      void run(id);
      return;
    }
    const id = parseCubeCobraId(source);
    if (!id) {
      setStatus({
        kind: "error",
        message: "Paste a CubeCobra cube URL or ID (e.g. cubecobra.com/cube/overview/xyz).",
      });
      return;
    }
    void run(id);
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    onClose();
  };

  // ---- progress ----
  if (status.kind === "fetching" || status.kind === "running") {
    const total = status.kind === "running" ? status.total : 0;
    const done = status.kind === "running" ? status.done : 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
      <Modal onClose={handleCancel} persistent>
        <h2 className="mb-2 text-lg font-medium text-(--color-text)">
          {status.kind === "fetching"
            ? "Fetching cube from CubeCobra…"
            : "Looking up cards on Scryfall…"}
        </h2>
        <p className="mb-3 text-sm text-(--color-text-dim)">
          {status.kind === "fetching"
            ? "Reading the cube list."
            : `${done} / ${total} (${pct}%)`}
        </p>
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-(--color-bg)">
          <div
            className="h-full bg-(--color-accent) transition-all"
            style={{ width: `${status.kind === "fetching" ? 8 : pct}%` }}
          />
        </div>
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

  // ---- result ----
  if (status.kind === "done") {
    const { cube, failures, duplicatesSkipped, diff } = status;
    return (
      <Modal onClose={() => onDone(cube)} persistent>
        <h2 className="mb-2 text-lg font-medium text-(--color-text)">
          {isRefresh ? "Cube refreshed" : "Cube imported"}
        </h2>
        <p className="mb-3 text-sm text-(--color-text-dim)">
          <span className="text-(--color-text)">{cube.name}</span> ·{" "}
          {cube.cards.length} cards
          {diff && (diff.added > 0 || diff.removed > 0) ? (
            <>
              {" "}
              ·{" "}
              {diff.added > 0 && (
                <span className="text-green-400">+{diff.added} added</span>
              )}
              {diff.added > 0 && diff.removed > 0 && ", "}
              {diff.removed > 0 && (
                <span className="text-red-400">−{diff.removed} removed</span>
              )}
            </>
          ) : diff ? (
            " · already up to date"
          ) : null}
        </p>

        {duplicatesSkipped > 0 && (
          <p className="mb-3 rounded border border-(--color-border) bg-black/30 p-2 text-xs text-(--color-text-dim)">
            {duplicatesSkipped} duplicate{duplicatesSkipped === 1 ? "" : "s"} skipped —
            Booster Tutor tracks cards by printing, so the same printing can only
            appear once per cube.
          </p>
        )}

        {failures.length > 0 && (
          <>
            <p className="mb-2 text-sm text-(--color-text-dim)">
              {failures.length} card{failures.length === 1 ? "" : "s"} couldn't be
              resolved:
            </p>
            <ul className="mb-4 max-h-52 overflow-auto rounded border border-(--color-border) bg-black/30 p-2 text-xs">
              {failures.map((f, i) => (
                <li
                  key={i}
                  className="border-b border-(--color-border) py-1 last:border-b-0"
                >
                  <div className="text-(--color-text)">{f.line}</div>
                  <div className="text-(--color-text-dim)">{f.reason}</div>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onDone(cube)}
            className="rounded bg-(--color-accent) px-4 py-2 text-sm font-medium text-black hover:bg-(--color-accent-bright)"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  // ---- input / confirm ----
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 text-lg font-medium text-(--color-text)">
        {isRefresh ? "Refresh from CubeCobra" : "Import from CubeCobra"}
      </h2>

      {mode.kind === "refresh" ? (
        <p className="mb-4 text-sm text-(--color-text-dim)">
          Re-pull <span className="text-(--color-text)">{mode.cube.name}</span> from
          CubeCobra cube{" "}
          <span className="font-mono text-(--color-text)">{mode.cube.cubecobraId}</span>.
          This replaces its card list with the current one. Your inventory and
          picked-card history stay put.
        </p>
      ) : (
        <>
          <label className="mb-2 block text-xs uppercase tracking-wide text-(--color-text-dim)">
            CubeCobra URL or ID
          </label>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="https://cubecobra.com/cube/overview/xyz"
            className="mb-3 w-full rounded border border-(--color-border) bg-(--color-bg) px-2 py-1.5 text-sm text-(--color-text)"
          />

          <label className="mb-2 block text-xs uppercase tracking-wide text-(--color-text-dim)">
            Name (optional)
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Defaults to the cube's name on CubeCobra"
            className="mb-3 w-full rounded border border-(--color-border) bg-(--color-bg) px-2 py-1.5 text-sm text-(--color-text)"
          />

          <p className="mb-3 text-xs text-(--color-text-dim)">
            Pulls the mainboard with exact printings — no per-card lookups, so it
            takes seconds. You can re-pull it later from the cube list instead of
            uploading a new file.
          </p>
        </>
      )}

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
          {isRefresh ? "Refresh" : "Import"}
        </button>
      </div>
    </Modal>
  );
}
