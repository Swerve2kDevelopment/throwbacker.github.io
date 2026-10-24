export function StatCard({
  label,
  value,
  helper,
  accent = false
}: {
  label: string;
  value: string | number;
  helper?: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? "stat-tile stat-tile-accent" : "stat-tile"}>
      <p>{label}</p>
      <strong className={String(value).length > 8 ? "is-long" : undefined}>{value}</strong>
      {helper ? <em>{helper}</em> : null}
    </div>
  );
}
