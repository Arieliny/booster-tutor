import { useRef, useState } from "react";
import { downloadText } from "../lib/cube-export";
import {
  STATUSES,
  STATUS_LABEL,
  cubeCobraName,
  mergeImport,
  summarize,
  toExportFile,
  type Decisions,
  type ReviewCard,
} from "../lib/cube-review";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure contexts: fall back to a hidden textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

const stamp = () => new Date().toISOString().slice(0, 10);

/**
 * Export / import decisions as a JSON file, to move them between laptop and
 * phone. Import merges card by card, keeping whichever edit is newer.
 */
export function DecisionsSync({
  decisions,
  onImport,
}: {
  decisions: Decisions;
  onImport: (d: Decisions) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const doExport = () => {
    const file = toExportFile(decisions);
    downloadText(`cube-review-decisions-${stamp()}.json`, JSON.stringify(file, null, 1));
    setMsg(`Exported ${Object.keys(file.decisions).length} decisions`);
  };

  const doImport = async (f: File) => {
    try {
      const { merged, updated, total } = mergeImport(decisions, await f.text());
      onImport(merged);
      setMsg(`Imported: ${updated} of ${total} were newer and applied`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  };

  return (
    <span className="flex flex-wrap items-center gap-2">
      {msg && <span className="text-xs text-(--color-text)">{msg}</span>}
      <button
        type="button"
        onClick={doExport}
        className="rounded border border-(--color-border) px-3 py-1.5 text-sm text-(--color-text-dim) hover:bg-white/5"
      >
        Export decisions
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="rounded border border-(--color-border) px-3 py-1.5 text-sm text-(--color-text-dim) hover:bg-white/5"
      >
        Import
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doImport(f);
          e.target.value = "";
        }}
      />
    </span>
  );
}

export function CubeReviewSummary({
  decisions,
  onOpenCard,
}: {
  decisions: Decisions;
  onOpenCard: (id: string) => void;
}) {
  const s = summarize(decisions);
  const delta = s.result - s.current;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STATUSES.map((st) => (
          <div key={st} className="rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-3">
            <div className="text-xs text-(--color-text-dim)">{STATUS_LABEL[st]}</div>
            <div className="text-2xl font-semibold text-(--color-text)">{s.counts[st]}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm text-(--color-text-dim)">Resulting cube</span>
          <span className="text-3xl font-semibold text-(--color-text)">{s.result}</span>
          <span className="text-sm text-(--color-text-dim)">
            {s.current} now − {s.cuts.length} cuts + {s.adds.length} adds
            {delta !== 0 && (
              <span className={delta > 0 ? "text-amber-300" : "text-sky-300"}>
                {" "}
                ({delta > 0 ? "+" : ""}
                {delta})
              </span>
            )}
          </span>
        </div>
        {(s.ignoredCuts > 0 || s.ignoredAdds > 0) && (
          <p className="mt-1 text-xs text-(--color-text-dim)">
            Not counted:{" "}
            {s.ignoredCuts > 0 && `${s.ignoredCuts} Cut on cards you don't run`}
            {s.ignoredCuts > 0 && s.ignoredAdds > 0 && " · "}
            {s.ignoredAdds > 0 && `${s.ignoredAdds} Add on cards you already run`}
          </p>
        )}

        <table className="mt-4 w-full max-w-md text-sm">
          <thead>
            <tr className="text-left text-xs text-(--color-text-dim)">
              <th className="py-1 font-normal">Colour</th>
              <th className="py-1 text-right font-normal">Now</th>
              <th className="py-1 text-right font-normal">Cut</th>
              <th className="py-1 text-right font-normal">Add</th>
              <th className="py-1 text-right font-normal">After</th>
            </tr>
          </thead>
          <tbody>
            {s.balance.map((b) => {
              const after = b.now - b.minus + b.plus;
              return (
                <tr key={b.id} className="border-t border-(--color-border)">
                  <td className="py-1.5 text-(--color-text)">{b.label}</td>
                  <td className="py-1.5 text-right tabular-nums text-(--color-text-dim)">{b.now}</td>
                  <td className="py-1.5 text-right tabular-nums text-red-300">{b.minus ? `−${b.minus}` : ""}</td>
                  <td className="py-1.5 text-right tabular-nums text-emerald-300">{b.plus ? `+${b.plus}` : ""}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-(--color-text)">
                    {after}
                    {after !== b.now && (
                      <span className="ml-1 text-xs font-normal text-(--color-text-dim)">
                        ({after > b.now ? "+" : ""}
                        {after - b.now})
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <NameList title="Add list" hint="Paste into Cube Cobra → Edit → Add" cards={s.adds} onOpenCard={onOpenCard} file="adds" />
        <NameList title="Cut list" hint="Paste into Cube Cobra → Edit → Remove" cards={s.cuts} onOpenCard={onOpenCard} file="cuts" />
      </div>
    </div>
  );
}

function NameList({
  title,
  hint,
  cards,
  onOpenCard,
  file,
}: {
  title: string;
  hint: string;
  cards: ReviewCard[];
  onOpenCard: (id: string) => void;
  file: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = cards.map(cubeCobraName).join("\n");
  return (
    <div className="rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-(--color-text)">
          {title} · {cards.length}
        </span>
        <span className="text-xs text-(--color-text-dim)">{hint}</span>
        <span className="ml-auto flex gap-1.5">
          <button
            type="button"
            disabled={cards.length === 0}
            onClick={async () => {
              setCopied(await copy(text));
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded bg-(--color-accent) px-3 py-1 text-sm font-medium text-black hover:bg-(--color-accent-bright) disabled:opacity-40"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            disabled={cards.length === 0}
            onClick={() => downloadText(`cube-${file}-${stamp()}.txt`, text + "\n")}
            className="rounded border border-(--color-border) px-3 py-1 text-sm text-(--color-text-dim) hover:bg-white/5 disabled:opacity-40"
          >
            .txt
          </button>
        </span>
      </div>
      {cards.length === 0 ? (
        <p className="mt-3 text-sm text-(--color-text-dim)">Nothing yet.</p>
      ) : (
        <ul className="mt-2 max-h-72 overflow-y-auto text-sm">
          {cards.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpenCard(c.id)}
                className="w-full truncate py-0.5 text-left text-(--color-text) hover:text-(--color-accent)"
              >
                {cubeCobraName(c)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
