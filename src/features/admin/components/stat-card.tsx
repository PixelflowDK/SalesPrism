import { FC } from "react";

// DESIGN.md §5.6 — stat cards: compact metric label (mono, uppercase) +
// value (large, mono for numeric data).
export const StatCard: FC<{ label: string; value: string | number }> = ({
  label,
  value,
}) => (
  <div className="rounded-md border border-border bg-card p-5">
    <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
      {label}
    </p>
    <p className="mt-2 font-mono text-2xl text-foreground">{value}</p>
  </div>
);
