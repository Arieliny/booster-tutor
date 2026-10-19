/** Top of Play: opening packs, or dealing decks. */
export function PlaySwitch({ value, onChange }: { value: "packs" | "decks"; onChange: (v: "packs" | "decks") => void }) {
  const options: ["packs" | "decks", string][] = [
    ["packs", "Packs"],
    ["decks", "Decks"],
  ];
  return (
    <div role="tablist" aria-label="Play" className="flex rounded-lg border border-(--color-border) bg-(--color-bg-elev) p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={
            "flex-1 rounded-md px-3 py-1.5 text-sm transition-colors " +
            (value === v ? "bg-(--color-accent) font-medium text-black" : "text-(--color-text-dim) hover:text-(--color-text)")
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
