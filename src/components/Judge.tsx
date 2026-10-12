import { useEffect, useRef, useState } from "react";
import {
  askJudge,
  getAllowance,
  loadConversation,
  saveConversation,
  suggestCards,
  type Allowance,
  type JudgeEvent,
  type JudgeMessage,
} from "../lib/judge";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import { Sheet } from "./Sheet";

const EXAMPLES = [
  "Blood Moon is out. What happens to Urza's Saga?",
  "Can I respond to a cascade trigger after seeing what it hits?",
  "If I flicker a creature with an aura on it, where does the aura go?",
];

type Busy = { status: string | null; draft: string } | null;

/**
 * Ask the rules judge. Cards "on the table" go with every question until
 * removed; the conversation stays on this device until "New question".
 */
export function Judge() {
  const [{ messages, cards }, setConvo] = useState(loadConversation);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [adding, setAdding] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveConversation(messages, cards), [messages, cards]);

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
    setConvo((c) => ({ ...c, messages: history }));
    setInput("");
    setError(null);
    setBusy({ status: "Reading the question", draft: "" });
    const ac = new AbortController();
    abortRef.current = ac;
    let draft = "";
    let failed = false;
    const onEvent = (e: JudgeEvent) => {
      if (e.type === "status") setBusy({ status: e.text, draft: "" });
      else if (e.type === "reset") {
        draft = "";
        setBusy((b) => (b ? { ...b, draft: "" } : b));
      } else if (e.type === "text") {
        draft += e.delta;
        setBusy({ status: null, draft });
      } else if (e.type === "done") {
        setAllowance((a) => (a ? { ...a, remaining: e.remaining } : a));
      } else if (e.type === "error") {
        failed = true;
        setError(e.message);
      }
    };
    try {
      await askJudge(history, cards, onEvent, ac.signal);
    } catch (err) {
      if (!ac.signal.aborted) {
        failed = true;
        setError(navigator.onLine ? `The judge couldn't be reached: ${String(err)}` : "You're offline — the judge needs a connection.");
      }
    } finally {
      setBusy(null);
      abortRef.current = null;
      if (draft.trim()) setConvo((c) => ({ ...c, messages: [...c.messages, { role: "assistant", content: draft }] }));
      // Nothing came back: take the question off again so it can be re-sent.
      else if (failed || ac.signal.aborted) {
        setConvo((c) => ({ ...c, messages: c.messages.slice(0, -1) }));
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
        {(messages.length > 0 || cards.length > 0) && (
          <button
            type="button"
            onClick={newQuestion}
            className="ml-auto rounded border border-(--color-border) px-3 py-1.5 text-sm text-(--color-text) hover:bg-white/5"
          >
            New question
          </button>
        )}
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
      <div className="sticky bottom-16 -mx-4 space-y-2 border-t border-(--color-border) bg-(--color-bg) px-4 pt-3 pb-3 sm:-mx-6 sm:px-6 md:bottom-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {cards.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full bg-(--color-accent)/15 py-1 pr-1 pl-3 text-xs text-(--color-text)"
            >
              {c}
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
