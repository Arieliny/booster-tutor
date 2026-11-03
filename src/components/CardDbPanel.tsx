import { useState } from "react";
import { DB_DOWNLOAD_LABEL, loadWifiOnly, saveWifiOnly, useCardDb } from "../lib/card-db";
import { shortDate } from "../lib/short-date";

type CardDbHook = ReturnType<typeof useCardDb>;

/** Download / update / remove the offline card database. */
export function CardDbPanel({ db }: { db: CardDbHook }) {
  const { state, download, remove } = db;
  const [wifiOnly, setWifiOnly] = useState(loadWifiOnly);
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
          {db.updateWaiting && <span className="text-(--color-gold)">New cards are out</span>}
          {!db.updateWaiting && db.upToDate && <span>Up to date</span>}
          <span className="ml-auto flex gap-2">
            {/* Updates download only the parts that changed (lib/card-db.ts downloadDb), so with nothing new this only checks. */}
            <button type="button" onClick={download} className="rounded border border-(--color-border) px-2 py-1 hover:bg-(--color-text)/5">
              {db.updateWaiting ? `Update (${db.updateLabel})` : "Check for updates"}
            </button>
            <button type="button" onClick={remove} className="rounded border border-(--color-border) px-2 py-1 hover:bg-(--color-text)/5">
              Remove
            </button>
          </span>
          {/* New sets download by themselves (lib/card-db.ts refreshDbIfNewer); this keeps that off mobile data. */}
          <label className="flex basis-full cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={wifiOnly}
              onChange={(e) => {
                setWifiOnly(e.target.checked);
                saveWifiOnly(e.target.checked);
              }}
              className="h-4 w-4 accent-(--color-accent)"
            />
            <span>
              Update automatically on Wi-Fi only
              <span className="block text-[11px]">{wifiOnly ? "New cards wait until you're on Wi-Fi." : "New cards download on any connection, mobile data too."}</span>
            </span>
          </label>
        </>
      )}
      {state.kind === "busy" && <span className="text-(--color-text)">Downloading…</span>}
      {(state.kind === "absent" || state.kind === "error") && (
        <>
          {state.kind === "error" && <span className="text-(--color-gold)">{state.message}</span>}
          <button
            type="button"
            onClick={download}
            className="ml-auto rounded bg-(--color-accent) px-3 py-1.5 font-medium text-(--color-accent-ink) hover:bg-(--color-accent-bright)"
          >
            {state.kind === "error" ? "Try again" : `Download (${DB_DOWNLOAD_LABEL}, text only)`}
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Where cards are searched: nothing at all, unless the site has a newer card
 * database than this device's (it downloads by itself on Wi-Fi; this is for
 * when it's waiting). The settings live in Settings, not here.
 */
export function CardDbNotice({ db }: { db: CardDbHook }) {
  const { state, download, updateWaiting } = db;
  if (state.kind === "busy") return <p className="text-xs text-(--color-text-dim)">Updating the card list…</p>;
  if (!updateWaiting || state.kind !== "ready") return null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-(--color-gold)/50 bg-(--color-gold)/10 px-3 py-2 text-xs text-(--color-text)">
      <span className="min-w-0 flex-1">
        New cards are out. This phone's card list is from {shortDate(state.info.builtAt.slice(0, 10))}
        {loadWifiOnly() ? " and updates on Wi-Fi." : "."}
      </span>
      <button type="button" onClick={download} className="shrink-0 rounded border border-(--color-border) px-2 py-1 font-medium hover:bg-(--color-text)/5">
        Update now ({db.updateLabel ?? DB_DOWNLOAD_LABEL})
      </button>
    </div>
  );
}

/** Settings > Card database, in LifeTutor's own Settings page. */
export function CardDbSettings() {
  const db = useCardDb();
  return (
    <section className="space-y-2">
      <div className="text-[11px] font-medium tracking-wide text-(--color-text-dim) uppercase">Card database</div>
      <p className="text-sm text-(--color-text-dim)">
        Every Magic card's text on this phone, so Look up a card finds any card by name or rules text with no connection.
        Without it, cards come from Scryfall. The download is about {DB_DOWNLOAD_LABEL.replace("~", "")}, text only.
      </p>
      <CardDbPanel db={db} />
    </section>
  );
}
