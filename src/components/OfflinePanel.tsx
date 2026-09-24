import { useRef, useState } from "react";
import {
  cachesSupported,
  clearImageCache,
  countCached,
  estimateBytes,
  formatBytes,
  warmImageCache,
  type WarmProgress,
} from "../lib/offline";

interface Props {
  /** Image URLs to make available offline. */
  urls: string[];
}

type State =
  | { kind: "idle"; cached: number | null }
  | { kind: "running"; progress: WarmProgress }
  | { kind: "done"; progress: WarmProgress };

/**
 * Pre-download card images so the set review is fully usable with no signal —
 * the table itself already works offline, this covers the card images.
 */
export function OfflinePanel({ urls }: Props) {
  const [state, setState] = useState<State>({ kind: "idle", cached: null });
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const supported = cachesSupported();

  const refreshCount = async () => {
    const cached = await countCached(urls);
    setState({ kind: "idle", cached });
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && state.kind === "idle" && state.cached === null) void refreshCount();
  };

  const start = async () => {
    const ac = new AbortController();
    abortRef.current = ac;
    setState({
      kind: "running",
      progress: { done: 0, total: urls.length, bytes: 0, failed: 0 },
    });
    const final = await warmImageCache(urls, {
      signal: ac.signal,
      onProgress: (progress) => setState({ kind: "running", progress }),
    });
    setState({ kind: "done", progress: final });
  };

  const cancel = () => abortRef.current?.abort();

  const reset = async () => {
    await clearImageCache();
    await refreshCount();
  };

  if (!supported) return null;

  return (
    <div className="rounded-lg border border-(--color-border) bg-(--color-bg-elev)">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-(--color-text-dim) hover:text-(--color-text)"
      >
        <span>
          📶 Offline — save card images for the prerelease
          {state.kind === "idle" && state.cached !== null && (
            <span className="ml-1 text-(--color-text)">
              ({state.cached}/{urls.length} saved)
            </span>
          )}
        </span>
        <span className="text-[10px]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-(--color-border) p-3 text-xs">
          <p className="mb-3 text-(--color-text-dim)">
            The table, grades and rules text already work with no connection.
            This downloads the {urls.length} card images too — roughly{" "}
            {formatBytes(estimateBytes(urls.length))}. Do it on wifi, then add
            the app to your home screen.
          </p>

          {state.kind === "running" && (
            <>
              <div className="mb-2 flex items-center justify-between text-(--color-text-dim)">
                <span>
                  {state.progress.done} / {state.progress.total} ·{" "}
                  {formatBytes(state.progress.bytes)}
                </span>
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded border border-(--color-border) px-2 py-1 hover:bg-white/5"
                >
                  Stop
                </button>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-(--color-bg)">
                <div
                  className="h-full bg-(--color-accent) transition-all"
                  style={{
                    width: `${Math.round((state.progress.done / Math.max(1, state.progress.total)) * 100)}%`,
                  }}
                />
              </div>
            </>
          )}

          {state.kind === "done" && (
            <p className="mb-3 text-(--color-text)">
              Saved {state.progress.done - state.progress.failed} images (
              {formatBytes(state.progress.bytes)})
              {state.progress.failed > 0 && (
                <span className="text-yellow-400">
                  {" "}
                  · {state.progress.failed} failed, run it again to retry
                </span>
              )}
              .
            </p>
          )}

          {state.kind !== "running" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={start}
                className="rounded bg-(--color-accent) px-3 py-2 font-medium text-black hover:bg-(--color-accent-bright)"
              >
                {state.kind === "done" ? "Run again" : "Save images for offline"}
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded border border-(--color-border) px-3 py-2 text-(--color-text-dim) hover:bg-white/5"
              >
                Clear saved images
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
