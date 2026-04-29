interface Props {
  remaining: number;
  total: number;
}

export function PoolStatus({ remaining, total }: Props) {
  return (
    <div className="text-sm text-(--color-text-dim)">
      <span className="font-mono text-(--color-text)">{remaining}</span>
      <span className="mx-1">/</span>
      <span className="font-mono">{total}</span>
      <span className="ml-1">cards in pool</span>
    </div>
  );
}
