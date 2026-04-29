import type { Cube } from "../types";

interface Props {
  cubes: Cube[];
  selectedId: string;
  onSelect: (id: string) => void;
  onManage: () => void;
}

export function CubeSelector({ cubes, selectedId, onSelect, onManage }: Props) {
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="cube-selector">
        Cube
      </label>
      <select
        id="cube-selector"
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        className="max-w-[200px] truncate rounded border border-(--color-border) bg-(--color-bg-elev) px-2 py-1.5 text-sm text-(--color-text) hover:border-(--color-accent)"
      >
        {cubes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.cards.length})
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onManage}
        title="Manage cubes"
        className="rounded border border-(--color-border) px-2 py-1.5 text-xs text-(--color-text-dim) hover:bg-white/5"
      >
        Manage
      </button>
    </div>
  );
}
