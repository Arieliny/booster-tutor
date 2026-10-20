import { DB_DOWNLOAD_LABEL, type useCardDb } from "../lib/card-db";
import { shortDate } from "../lib/short-date";

type CardDbHook = ReturnType<typeof useCardDb>;

/** Download / update / remove the offline card database. */
export function CardDbPanel({ db }: { db: CardDbHook }) {
  const { state, download, remove } = db;
  if (state.kind === "checking") return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-3 py-2 text-xs text-(--color-text-dim)">
      <span>📚 Card database — every card's text, for offline lookup</span>
      {state.kind === "ready" && (
        <>
          <span className="text-(--color-text)">
            {state.info.count ? `${state.info.count.toLocaleString()} cards` : "Downloaded"}
            {state.info.builtAt && ` · updated ${shortDate(state.info.builtAt.slice(0, 10))}`}
          </span>
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={download} className="rounded border border-(--color-border) px-2 py-1 hover:bg-white/5">
              Update
            </button>
            <button type="button" onClick={remove} className="rounded border border-(--color-border) px-2 py-1 hover:bg-white/5">
              Remove
            </button>
          </span>
        </>
      )}
      {state.kind === "busy" && <span className="text-(--color-text)">Downloading…</span>}
      {(state.kind === "absent" || state.kind === "error") && (
        <>
          {state.kind === "error" && <span className="text-amber-300">{state.message}</span>}
          <button
            type="button"
            onClick={download}
            className="ml-auto rounded bg-(--color-accent) px-3 py-1.5 font-medium text-black hover:bg-(--color-accent-bright)"
          >
            {state.kind === "error" ? "Try again" : `Download (${DB_DOWNLOAD_LABEL}, text only)`}
          </button>
        </>
      )}
    </div>
  );
}
