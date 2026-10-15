interface Props {
  remaining: number;
  total: number;
}

export function PoolStatus({ remaining, total }: Props) {
  return (
    <div className="text-sm text-(--color-text-dim)">
      <span className="font-medium tabular-nums text-(--color-text)">{remaining}</span> of{" "}
      <span className="tabular-nums">{total}</span> cards left
    </div>
  );
}
