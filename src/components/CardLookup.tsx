import { useEffect, useMemo, useState } from "react";
import { searchDb, toReviewCard, type useCardDb } from "../lib/card-db";
import type { ReviewCard } from "../lib/cube-review";
import { scryfallSuggest } from "../lib/scryfall";
import { openSettings } from "../lib/routes";
import { ManaCost } from "./ManaCost";

type CardDbHook = ReturnType<typeof useCardDb>;

const SHOW = 30;

/**
 * Under the search box: every card in Magic that matches, beyond the ones
 * already on screen. Uses the offline card database when it's downloaded;
 * otherwise falls back to searching Scryfall (online only).
 */
export function CardLookup({
  q,
  exclude,
  db,
  onOpenCard,
  onScryfall,
}: {
  q: string;
  exclude: Set<string>;
  db: CardDbHook;
  onOpenCard: (c: ReviewCard) => void;
  onScryfall: (name: string) => Promise<void>;
}) {
  const needle = q.trim();
  const { state, load } = db;
  const needsLoad = needle.length >= 2 && state.kind === "ready" && !state.db;

  // Parse the database the first time a search actually needs it.
  useEffect(() => {
    if (needsLoad) void load();
  }, [needsLoad, load]);

  const results = useMemo(
    () => (state.kind === "ready" && state.db && needle.length >= 2 ? searchDb(state.db, needle, SHOW, exclude) : null),
    [state, needle, exclude],
  );

  if (needle.length < 2) return null;

  if (state.kind === "ready") {
    if (!results) return <Box>Loading the card database…</Box>;
    return (
      <Box>
        <div className="mb-1 text-xs text-(--color-text-dim)">
          {results.total === 0
            ? `No other card matches “${needle}”.`
            : `Other cards matching “${needle}” · ${results.total}${results.total > SHOW ? ` (first ${SHOW})` : ""}`}
        </div>
        {results.cards.length > 0 && (
          <ul className="-mx-1 max-h-80 divide-y divide-(--color-border) overflow-y-auto">
            {results.cards.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpenCard(toReviewCard(c))}
                  className="flex w-full items-center gap-2 px-1 py-2 text-left hover:bg-white/5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-(--color-text)">{c.n}</span>
                    <span className="block truncate text-xs text-(--color-text-dim)">{c.t ?? c.f?.[0]?.t}</span>
                  </span>
                  <span className="shrink-0">
                    <ManaCost cost={c.c ?? c.f?.map((f) => f.c ?? "").join(" // ") ?? ""} size={13} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {results.total === 0 && <ScryfallSearch q={needle} onPick={onScryfall} lead="Too new for the database?" />}
      </Box>
    );
  }

  if (state.kind === "busy") return <Box>Downloading the card database…</Box>;

  return (
    <Box>
      <ScryfallSearch q={needle} onPick={onScryfall} lead="Not in these cubes?" />
      {state.kind !== "checking" && (
        <div className="mt-1.5 text-xs text-(--color-text-dim)">
          To search all of Magic offline, download the card database in{" "}
          <button type="button" onClick={openSettings} className="text-(--color-accent) hover:underline">
            Settings
          </button>
          .
        </div>
      )}
    </Box>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-(--color-border) px-3 py-2 text-sm">{children}</div>;
}

type SuggestState =
  | { q: string; kind: "idle" }
  | { q: string; kind: "loading" }
  | { q: string; kind: "list"; names: string[] }
  | { q: string; kind: "error"; message: string };

/** Online fallback: card-name suggestions from Scryfall. */
function ScryfallSearch({
  q,
  onPick,
  lead,
}: {
  q: string;
  onPick: (name: string) => Promise<void>;
  lead: string;
}) {
  const [state, setState] = useState<SuggestState>({ q: "", kind: "idle" });
  const [busy, setBusy] = useState<string | null>(null);
  // Results belong to the query they were fetched for; a new query starts idle.
  const cur: SuggestState = state.q === q ? state : { q, kind: "idle" };
  const offlineMsg = "Needs a connection — you're offline.";

  const search = async () => {
    setState({ q, kind: "loading" });
    try {
      setState({ q, kind: "list", names: (await scryfallSuggest(q)).slice(0, 8) });
    } catch {
      setState({ q, kind: "error", message: navigator.onLine ? "Scryfall didn't respond. Try again." : offlineMsg });
    }
  };

  const pick = async (name: string) => {
    setBusy(name);
    try {
      await onPick(name);
    } catch {
      setState({ q, kind: "error", message: navigator.onLine ? `Couldn't load ${name}.` : offlineMsg });
    } finally {
      setBusy(null);
    }
  };

  if (cur.kind === "idle") {
    return (
      <button type="button" onClick={search} className="text-(--color-accent) hover:underline">
        {lead} Search Scryfall for “{q}” →
      </button>
    );
  }
  if (cur.kind === "loading") return <span className="text-(--color-text-dim)">Searching Scryfall…</span>;
  if (cur.kind === "error") {
    return (
      <span className="text-(--color-text-dim)">
        {cur.message}{" "}
        <button type="button" onClick={search} className="text-(--color-accent) hover:underline">
          Retry
        </button>
      </span>
    );
  }
  if (cur.names.length === 0) return <span className="text-(--color-text-dim)">No card on Scryfall matches “{q}”.</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-(--color-text-dim)">From Scryfall:</span>
      {cur.names.map((n) => (
        <button
          key={n}
          type="button"
          disabled={busy !== null}
          onClick={() => pick(n)}
          className="rounded-full border border-(--color-border) px-2.5 py-1 text-xs text-(--color-text) hover:bg-white/5 disabled:opacity-50"
        >
          {busy === n ? "Opening…" : n}
        </button>
      ))}
    </div>
  );
}
