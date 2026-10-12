import { Icon } from "./Icon";

/** Title row for a page inside a section, with a way back to the section's home. */
export function PageHeader({
  title,
  onBack,
  backLabel,
  right,
}: {
  title: string;
  onBack: () => void;
  backLabel: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        title={backLabel}
        className="-ml-2 shrink-0 rounded-lg p-2 text-(--color-text-dim) hover:bg-white/5 hover:text-(--color-text)"
      >
        <Icon name="back" />
      </button>
      <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-(--color-text)">{title}</h2>
      {right}
    </div>
  );
}
