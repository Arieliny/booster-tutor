/**
 * "Did you mean Lightning Bolt?" under a card search that found no card by
 * that name: the best guess as a link, up to two more after it.
 */
export function DidYouMean({ names, onPick, busy }: { names: string[]; onPick: (name: string) => void; busy?: string | null }) {
  if (names.length === 0) return null;
  const [best, ...more] = names;
  const link = (n: string, strong: boolean) => (
    <button
      key={n}
      type="button"
      onClick={() => onPick(n)}
      disabled={!!busy}
      className={"text-(--color-accent) hover:underline disabled:opacity-50 " + (strong ? "font-semibold" : "")}
    >
      {busy === n ? "Opening…" : n}
    </button>
  );
  return (
    <p className="text-sm text-(--color-text-dim)">
      Did you mean {link(best, true)}?
      {more.length > 0 && (
        <span className="text-xs">
          {" "}
          Or{" "}
          {more.map((n, i) => (
            <span key={n}>
              {i > 0 && ", "}
              {link(n, false)}
            </span>
          ))}
        </span>
      )}
    </p>
  );
}
