import { useEffect, useMemo, useState } from "react";
import { searchDb, toReviewCard, useCardDb, type DbCard } from "../lib/card-db";
import type { ReviewCard } from "../lib/cube-review";
import { scryfallCard, scryfallSuggest } from "../lib/scryfall";
import { CardDbPanel } from "./CardDbPanel";
import { Icon } from "./Icon";
import { ManaCost } from "./ManaCost";
import { Rulings } from "./Rulings";

const SHOW = 30;
const NONE = new Set<string>();

/** Scryfall's name suggestions, kept with the text they were for. */
type Suggest = { q: string; names: string[] } | { q: string; error: string };

/**
 * Card search in the life counter, for everyone: find a card by name and read
 * it (text and official rulings). Free to run - names come from the offline
 * card database when it's downloaded, otherwise straight from Scryfall; there
 * is no AI "describe it" search here.
 */
export function CardSearch({ onAskJudge }: { onAskJudge?: (name: string) => void }) {
  const db = useCardDb();
  const { state, load } = db;
  const [q, setQ] = useState("");
  const [card, setCard] = useState<ReviewCard | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const needle = q.trim();
  const offline = state.kind === "ready";
  const needsLoad = needle.length >= 2 && offline && !state.db;

  // Parse the downloaded database the first time a search needs it.
  useEffect(() => {
    if (needsLoad) void load();
  }, [needsLoad, load]);

  const local = useMemo(
    () => (state.kind === "ready" && state.db && needle.length >= 2 ? searchDb(state.db, needle, SHOW, NONE) : null),
    [state, needle],
  );

  // No database: ask Scryfall for names as you type (after a short pause).
  const online = !offline && state.kind !== "checking" && state.kind !== "busy" && needle.length >= 2;
  useEffect(() => {
    if (!online) return;
    const ctl = new AbortController();
    const t = window.setTimeout(() => {
      scryfallSuggest(needle, ctl.signal)
        .then((names) => setSuggest({ q: needle, names: names.slice(0, 12) }))
        .catch(() => {
          if (!ctl.signal.aborted)
            setSuggest({ q: needle, error: navigator.onLine ? "Scryfall didn't answer. Keep typing to try again." : "You're offline." });
        });
    }, 250);
    return () => {
      ctl.abort();
      window.clearTimeout(t);
    };
  }, [online, needle]);
  const names = suggest?.q === needle ? suggest : null;

  const openNamed = async (name: string) => {
    setOpening(name);
    setOpenError(null);
    try {
      setCard(await scryfallCard(name));
    } catch {
      setOpenError(navigator.onLine ? `Couldn't load ${name}.` : "You're offline.");
    } finally {
      setOpening(null);
    }
  };

  if (card) return <CardView card={card} onBack={() => setCard(null)} onAskJudge={onAskJudge} />;

  return (
    <div className="mx-auto max-w-3xl space-y-3 pb-6">
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-(--color-text-dim)" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            // Start parsing the database while the name is being typed.
            if (state.kind === "ready" && !state.db) void load();
          }}
          placeholder={offline ? "A card name or rules text" : "A card name"}
          aria-label="Search for a card"
          autoFocus
          className="w-full rounded-lg border border-(--color-border) bg-(--color-bg-elev) py-2.5 pr-3 pl-10 text-base text-(--color-text) placeholder:text-(--color-text-dim)"
        />
      </div>

      {openError && <p className="text-sm text-amber-300">{openError}</p>}

      {needle.length >= 2 && offline && (
        <Results>
          {!local ? (
            <Note>Loading the card database…</Note>
          ) : local.total === 0 ? (
            <Note>No card matches “{needle}”.</Note>
          ) : (
            local.cards.map((d) => <DbRow key={d.id} d={d} onOpen={() => setCard(toReviewCard(d))} />)
          )}
        </Results>
      )}

      {online && (
        <Results>
          {!names ? (
            <Note>Searching…</Note>
          ) : "error" in names ? (
            <Note>
              {names.error}
              {!navigator.onLine && " Download the card database below to search with no connection."}
            </Note>
          ) : names.names.length === 0 ? (
            <Note>No card matches “{needle}”.</Note>
          ) : (
            names.names.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => void openNamed(n)}
                  disabled={!!opening}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-(--color-text) hover:bg-white/5"
                >
                  {n}
                  {opening === n && <span className="text-xs text-(--color-text-dim)">Opening…</span>}
                </button>
              </li>
            ))
          )}
        </Results>
      )}

      <CardDbPanel db={db} />
    </div>
  );
}

function Results({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-(--color-border) overflow-hidden rounded-lg border border-(--color-border)">{children}</ul>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <li className="px-3 py-2.5 text-sm text-(--color-text-dim)">{children}</li>;
}

function DbRow({ d, onOpen }: { d: DbCard; onOpen: () => void }) {
  const c = toReviewCard(d);
  return (
    <li>
      <button type="button" onClick={onOpen} className="w-full px-3 py-2 text-left hover:bg-white/5">
        <span className="flex flex-wrap items-center gap-2 text-sm text-(--color-text)">
          {c.name}
          {c.cost && <ManaCost cost={c.cost} size={13} />}
        </span>
        <span className="block truncate text-xs text-(--color-text-dim)">{c.type}</span>
      </button>
    </li>
  );
}

/** One card: its image (when it loads), its text, and the official rulings. */
function CardView({ card: c, onBack, onAskJudge }: { card: ReviewCard; onBack: () => void; onAskJudge?: (name: string) => void }) {
  const [face, setFace] = useState<"front" | "back">("front");
  const [noImage, setNoImage] = useState(false);
  const img = c.img ? c.img.replace("/small/", "/normal/").replace("/front/", `/${face}/`) : null;
  const faces = c.faces ?? [{ name: c.name, cost: c.cost, type: c.type, text: c.text, pt: c.pt, loy: c.loy }];
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-6">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-(--color-text-dim) hover:text-(--color-text)">
        <Icon name="back" className="h-4 w-4" /> Back to results
      </button>
      <div className="grid gap-4 sm:grid-cols-[260px_minmax(0,1fr)]">
        {img && !noImage && (
          <div className="mx-auto w-full max-w-[300px]">
            <img
              key={img}
              src={img}
              alt={c.name}
              // Offline with no saved image: just the text.
              onError={() => setNoImage(true)}
              className="aspect-[488/680] w-full rounded-[4.5%] bg-(--color-bg) object-cover"
            />
            {c.back && (
              <button
                type="button"
                onClick={() => setFace((f) => (f === "front" ? "back" : "front"))}
                className="mt-2 w-full rounded border border-(--color-border) py-1.5 text-sm text-(--color-text-dim) hover:bg-white/5"
              >
                ⟲ Show {face === "front" ? "back" : "front"} face
              </button>
            )}
          </div>
        )}
        <div className="min-w-0 space-y-3 text-sm">
          {faces.map((f, i) => (
            <div key={i} className={i > 0 ? "border-t border-(--color-border) pt-3" : ""}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-(--color-text)">{f.name}</span>
                {f.cost && <ManaCost cost={f.cost} />}
              </div>
              <div className="text-xs text-(--color-text-dim)">
                {f.type}
                {f.pt && <> · {f.pt}</>}
                {f.loy && <> · loyalty {f.loy}</>}
              </div>
              {f.text && (
                <div className="mt-2 space-y-1 leading-relaxed text-(--color-text)">
                  {f.text.split("\n").map((line, j) => (
                    <p key={j}>{line}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
          <Rulings sid={c.sid} oracleId={c.id} />
          {onAskJudge && (
            <button
              type="button"
              onClick={() => onAskJudge(c.name)}
              className="w-full rounded-lg border border-(--color-accent)/60 py-2 text-sm text-(--color-text) hover:bg-(--color-accent)/10"
            >
              Ask the judge about this card
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
