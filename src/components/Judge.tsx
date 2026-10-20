import { useEffect, useRef, useState } from "react";
import {
  askJudge,
  cachedHistory,
  clearHistory,
  deleteThread,
  fetchHistory,
  formatCost,
  getAllowance,
  openingConversation,
  openThread,
  rememberThread,
  saveConversation,
  suggestCards,
  tookHandOff,
  type Allowance,
  type Conversation,
  type JudgeEvent,
  type JudgeMessage,
  type ThreadSummary,
} from "../lib/judge";
import { Icon } from "./Icon";
import { ManaCost } from "./ManaCost";
import { Markdown } from "./Markdown";
import { Rulings } from "./Rulings";
import { Sheet } from "./Sheet";

const EXAMPLES = [
  "Blood Moon is out. What happens to Urza's Saga?",
  "Can I respond to a cascade trigger after seeing what it hits?",
  "If I flicker a creature with an aura on it, where does the aura go?",
];

type Busy = { status: string | null; draft: string } | null;

/**
 * Ask the rules judge. Cards "on the table" go with every question until
 * removed. Every answered thread goes into History (last 50, synced across
 * your devices), where it can be reread or continued.
 */
export function Judge({ embedded = false }: { embedded?: boolean } = {}) {
  // Opens on a blank question (or the card from "Ask the judge about this card").
  const [convo, setConvo] = useState<Conversation>(openingConversation);
  const { messages, cards } = convo;
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveConversation(convo), [convo]);
  useEffect(() => tookHandOff(), []);

  useEffect(() => {
    getAllowance().then(setAllowance, () => {});
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      abortRef.current?.abort();
    };
  }, []);

  // Keep the newest part of the conversation in view while it's written.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy?.draft, busy?.status]);

  const setCards = (next: string[]) => setConvo((c) => ({ ...c, cards: next }));

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history: JudgeMessage[] = [...messages, { role: "user", content: q }];
    const asked = { messages: history, cards, threadId: convo.threadId };
    setConvo(asked);
    setInput("");
    setError(null);
    setBusy({ status: "Reading the question", draft: "" });
    const ac = new AbortController();
    abortRef.current = ac;
    let draft = "";
    let failed = false;
    let refused = false;
    let cost: number | undefined;
    let threadId = convo.threadId;
    const onEvent = (e: JudgeEvent) => {
      if (e.type === "thread") threadId = e.id;
      else if (e.type === "status") setBusy({ status: e.text, draft: "" });
      else if (e.type === "reset") {
        draft = "";
        setBusy((b) => (b ? { ...b, draft: "" } : b));
      } else if (e.type === "text") {
        draft += e.delta;
        setBusy({ status: null, draft });
      } else if (e.type === "done") {
        refused = !!e.refused;
        cost = e.cost;
        setAllowance((a) => (a ? { ...a, remaining: e.remaining } : a));
      } else if (e.type === "error") {
        failed = true;
        setError(e.message);
      }
    };
    try {
      await askJudge(asked, onEvent, ac.signal);
    } catch (err) {
      if (!ac.signal.aborted) {
        failed = true;
        setError(navigator.onLine ? `The judge couldn't be reached: ${String(err)}` : "You're offline — the judge needs a connection.");
      }
    } finally {
      setBusy(null);
      abortRef.current = null;
      if (draft.trim()) {
        const answer: JudgeMessage = cost === undefined ? { role: "assistant", content: draft } : { role: "assistant", content: draft, cost };
        const answered: Conversation = { ...asked, messages: [...history, answer], threadId };
        setConvo(answered);
        // The server saved it to History; keep this device's copy in step (refusals aren't saved).
        if (!refused) rememberThread(answered);
      }
      // Nothing came back: take the question off again so it can be re-sent.
      else if (failed || ac.signal.aborted) {
        setConvo({ ...asked, messages: messages });
        setInput(q);
      }
    }
  };

  const newQuestion = () => {
    abortRef.current?.abort();
    setConvo({ messages: [], cards: [] });
    setError(null);
    setInput("");
  };

  const outOfRulings = allowance?.remaining === 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--color-text-dim)">
        <span>
          {allowance
            ? allowance.limit === null
              ? "No limit"
              : `${allowance.remaining} of ${allowance.limit} rulings left this month`
            : " "}
        </span>
        {allowance?.cr && <span>· Rules effective {allowance.cr}</span>}
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="rounded border border-(--color-border) px-3 py-1.5 text-sm text-(--color-text) hover:bg-white/5"
          >
            History
          </button>
          {(messages.length > 0 || cards.length > 0) && (
            <button
              type="button"
              onClick={newQuestion}
              className="rounded border border-(--color-border) px-3 py-1.5 text-sm text-(--color-text) hover:bg-white/5"
            >
              New question
            </button>
          )}
        </span>
      </div>

      {!online && (
        <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          You're offline. The judge needs a connection to look up cards and rules.
        </p>
      )}

      {messages.length === 0 && !busy && (
        <div className="space-y-2 rounded-xl border border-(--color-border) bg-(--color-bg-elev) p-4 text-sm">
          <p className="text-(--color-text)">
            Ask any rules question. The judge looks up current Oracle text, official rulings and the Comprehensive Rules before
            answering, and cites them.
          </p>
          <p className="text-(--color-text-dim)">Add the cards involved so it doesn't have to guess. For example:</p>
          <div className="flex flex-col items-start gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setInput(ex)}
                className="rounded-lg border border-(--color-border) px-3 py-1.5 text-left text-(--color-text-dim) hover:bg-white/5 hover:text-(--color-text)"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The conversation */}
      <div className="space-y-3">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-8 rounded-xl bg-(--color-bg-elev) px-3 py-2 text-sm whitespace-pre-wrap text-(--color-text) sm:ml-16">
              {m.content}
            </div>
          ) : (
            <div key={i} className="rounded-xl border border-(--color-border) px-3 py-3 text-sm text-(--color-text-dim)">
              <Markdown text={m.content} />
              {m.cost !== undefined && (
                <div className="mt-2 text-right text-xs text-(--color-text-dim)/70" title="Estimated from Anthropic's list prices. Only you see this.">
                  {formatCost(m.cost)}
                </div>
              )}
            </div>
          ),
        )}
        {busy && (
          <div className="rounded-xl border border-(--color-border) px-3 py-3 text-sm text-(--color-text-dim)">
            {busy.draft ? (
              <Markdown text={busy.draft} />
            ) : (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-(--color-accent) border-t-transparent" />
                {busy.status ?? "Thinking it through…"}
              </span>
            )}
          </div>
        )}
        {error && <p className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
        <div ref={endRef} />
      </div>

      {/* Composer: stays above the bottom nav on a phone. */}
      <div
        className={
          "sticky -mx-4 space-y-2 border-t border-(--color-border) bg-(--color-bg) px-4 pt-3 pb-3 " +
          (embedded ? "bottom-0" : "bottom-16 sm:-mx-6 sm:px-6 md:bottom-0")
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {cards.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full bg-(--color-accent)/15 py-1 pr-1 pl-3 text-xs text-(--color-text)"
            >
              <button type="button" onClick={() => setViewing(c)} title="See the card and its rulings" className="hover:underline">
                {c}
              </button>
              <button
                type="button"
                onClick={() => setCards(cards.filter((x) => x !== c))}
                aria-label={`Remove ${c}`}
                className="rounded-full p-0.5 text-(--color-text-dim) hover:bg-white/10"
              >
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-(--color-border) px-3 py-1 text-xs text-(--color-text-dim) hover:bg-white/5"
          >
            + Card
          </button>
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends on a laptop; Shift+Enter (or a phone's return key) adds a line.
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder={outOfRulings ? "No rulings left this month" : messages.length ? "Follow-up question…" : "Ask a rules question…"}
            disabled={outOfRulings}
            className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-(--color-border) bg-(--color-bg-elev) px-3 py-2 text-sm text-(--color-text) placeholder:text-(--color-text-dim) disabled:opacity-50"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="rounded-lg border border-(--color-border) px-4 py-2.5 text-sm text-(--color-text) hover:bg-white/5"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || outOfRulings || !online}
              className="rounded-lg bg-(--color-accent) px-4 py-2.5 text-sm font-semibold text-black hover:bg-(--color-accent-bright) disabled:opacity-40"
            >
              Ask
            </button>
          )}
        </form>
      </div>

      {showHistory && (
        <HistorySheet
          currentId={convo.threadId}
          onOpen={(c) => {
            abortRef.current?.abort();
            setConvo(c);
            setError(null);
            setInput("");
            setShowHistory(false);
          }}
          onClose={() => setShowHistory(false)}
        />
      )}

      {viewing && (
        <CardPreview
          name={viewing}
          onRemove={() => {
            setCards(cards.filter((x) => x !== viewing));
            setViewing(null);
          }}
          onClose={() => setViewing(null)}
        />
      )}

      {adding && (
        <CardPicker
          onPick={(name) => {
            if (!cards.includes(name)) setCards([...cards, name]);
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1 && new Date().getDate() === d.getDate()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Your past questions (last 50, synced across your devices). Tap one to reread or continue it. */
function HistorySheet({
  currentId,
  onOpen,
  onClose,
}: {
  currentId?: string;
  onOpen: (c: Conversation) => void;
  onClose: () => void;
}) {
  const [threads, setThreads] = useState<ThreadSummary[]>(cachedHistory);
  const [fresh, setFresh] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    fetchHistory().then(
      (t) => {
        setThreads(t);
        setFresh(true);
      },
      () => setError(navigator.onLine ? "Couldn't load your history. Showing what this device saved." : null),
    );
  }, []);

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? threads.filter((t) => (t.title + " " + t.cards.join(" ")).toLowerCase().includes(needle))
    : threads;

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(navigator.onLine ? (err instanceof Error ? err.message : String(err)) : "That needs a connection.");
    }
  };

  return (
    <Sheet
      title="History"
      onClose={onClose}
      action={
        threads.length > 0 &&
        (confirmClear ? (
          <span className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() =>
                run(async () => {
                  await clearHistory();
                  setThreads([]);
                  setConfirmClear(false);
                })
              }
              className="rounded bg-red-500/80 px-2 py-1 text-white hover:bg-red-500"
            >
              Clear all
            </button>
            <button type="button" onClick={() => setConfirmClear(false)} className="text-(--color-text-dim)">
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmClear(true)} className="text-sm text-(--color-text-dim) hover:text-red-300">
            Clear all
          </button>
        ))
      }
    >
      {threads.length > 0 && (
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your questions or cards"
          aria-label="Search history"
          className="mb-3 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) placeholder:text-(--color-text-dim)"
        />
      )}
      {error && <p className="mb-2 text-sm text-amber-300">{error}</p>}
      {threads.length === 0 ? (
        <p className="text-sm text-(--color-text-dim)">
          {fresh || !navigator.onLine ? "No questions yet. Every answered question lands here." : "Loading…"}
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-(--color-text-dim)">Nothing matches “{q}”.</p>
      ) : (
        <ul className="divide-y divide-(--color-border)">
          {shown.map((t) => (
            <li key={t.id} className="flex items-start gap-2 py-2.5">
              <button
                type="button"
                onClick={() => run(async () => onOpen(await openThread(t.id)))}
                className="min-w-0 flex-1 text-left"
              >
                <span className={"line-clamp-2 text-sm " + (t.id === currentId ? "text-(--color-accent-bright)" : "text-(--color-text)")}>
                  {t.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-(--color-text-dim)">
                  {when(t.updatedAt)}
                  {t.questions > 1 && ` · ${t.questions} questions`}
                  {t.cards.length > 0 && ` · ${t.cards.join(", ")}`}
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    await deleteThread(t.id);
                    setThreads((list) => list.filter((x) => x.id !== t.id));
                  })
                }
                aria-label={`Delete “${t.title}”`}
                className="shrink-0 rounded p-1.5 text-(--color-text-dim) hover:bg-white/5 hover:text-red-300"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

interface ScryFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: { normal?: string };
}
interface ScryCard extends ScryFace {
  id: string;
  oracle_id?: string;
  card_faces?: (ScryFace & { oracle_id?: string })[];
}

type Preview = { name: string; card?: ScryCard; error?: string };

/** One card's current Oracle text and official rulings, straight from Scryfall. */
function CardPreview({ name, onRemove, onClose }: { name: string; onRemove: () => void; onClose: () => void }) {
  const [state, setState] = useState<Preview>({ name });
  const shown = state.name === name ? state : { name };

  useEffect(() => {
    const ac = new AbortController();
    fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`, { signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<ScryCard>) : Promise.reject(new Error(String(r.status)))))
      .then(
        (card) => setState({ name, card }),
        () => {
          if (!ac.signal.aborted)
            setState({ name, error: navigator.onLine ? "Couldn't load this card from Scryfall." : "You're offline." });
        },
      );
    return () => ac.abort();
  }, [name]);

  const c = shown.card;
  const faces: ScryFace[] = c ? (c.card_faces?.length && !c.oracle_text ? c.card_faces : [c]) : [];
  const img = c?.image_uris?.normal ?? c?.card_faces?.[0]?.image_uris?.normal;
  const oracleId = c?.oracle_id ?? c?.card_faces?.[0]?.oracle_id ?? "";

  return (
    <Sheet
      title={name}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onRemove}
          className="w-full rounded-lg border border-(--color-border) py-2 text-sm text-(--color-text-dim) hover:bg-white/5"
        >
          Take it off this question
        </button>
      }
    >
      {!c && !shown.error && <p className="text-sm text-(--color-text-dim)">Loading…</p>}
      {shown.error && <p className="text-sm text-amber-300">{shown.error}</p>}
      {c && (
        <div className="space-y-3 text-sm">
          {img && <img src={img} alt={c.name} className="mx-auto w-full max-w-[260px] rounded-[4.5%]" />}
          {faces.map((f, i) => (
            <div key={i} className={i > 0 ? "border-t border-(--color-border) pt-3" : ""}>
              <div className="flex flex-wrap items-center gap-2 font-semibold text-(--color-text)">
                {f.name}
                {f.mana_cost && <ManaCost cost={f.mana_cost} size={14} />}
              </div>
              <div className="text-xs text-(--color-text-dim)">
                {f.type_line}
                {f.power !== undefined && ` · ${f.power}/${f.toughness}`}
                {f.loyalty !== undefined && ` · loyalty ${f.loyalty}`}
              </div>
              {f.oracle_text && (
                <div className="mt-1.5 space-y-1 leading-relaxed text-(--color-text)">
                  {f.oracle_text.split("\n").map((line, j) => (
                    <p key={j}>{line}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
          {oracleId && <Rulings sid={c.id} oracleId={oracleId} />}
        </div>
      )}
    </Sheet>
  );
}

type Suggest = { q: string; names: string[]; error?: string };

/** Find a card by name (Scryfall), any card in Magic. */
function CardPicker({ onPick, onClose }: { onPick: (name: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Suggest>({ q: "", names: [] });
  const needle = q.trim();

  useEffect(() => {
    if (needle.length < 2) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      suggestCards(needle, ac.signal).then(
        (names) => setResult({ q: needle, names }),
        () => {
          if (!ac.signal.aborted)
            setResult({ q: needle, names: [], error: navigator.onLine ? "Scryfall didn't answer. Try again." : "You're offline." });
        },
      );
    }, 200);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [needle]);

  const shown = result.q === needle ? result : null;

  return (
    <Sheet title="Add a card" onClose={onClose}>
      <input
        type="search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Card name"
        aria-label="Card name"
        className="mb-3 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2.5 text-base text-(--color-text) placeholder:text-(--color-text-dim)"
      />
      {needle.length >= 2 && !shown && <p className="text-sm text-(--color-text-dim)">Searching…</p>}
      {shown?.error && <p className="text-sm text-amber-300">{shown.error}</p>}
      {shown && !shown.error && shown.names.length === 0 && (
        <p className="text-sm text-(--color-text-dim)">No card matches “{needle}”.</p>
      )}
      <ul className="divide-y divide-(--color-border)">
        {shown?.names.map((n) => (
          <li key={n}>
            <button type="button" onClick={() => onPick(n)} className="w-full px-1 py-2.5 text-left text-sm text-(--color-text) hover:bg-white/5">
              {n}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
