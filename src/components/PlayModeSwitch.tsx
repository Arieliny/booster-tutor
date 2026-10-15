/** Top of Play: opening packs, or keeping score. */
export function PlayModeSwitch({ value, onChange }: { value: "packs" | "life"; onChange: (v: "packs" | "life") => void }) {
  const options: ["packs" | "life", string][] = [
    ["packs", "Packs"],
    ["life", "Life"],
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
