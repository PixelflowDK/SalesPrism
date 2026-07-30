import { FC } from "react";
import { cn } from "./lib";

interface Props {
  isLoading: boolean;
}

// DESIGN.md §5.8 — "never a generic spinner." A slow, --color-primary
// dot-wave stands in for the LDRS-style loader referenced in
// docs/Frontend_Teknologi_Reference.md §8 without adding a new dependency.
// Tailwind's `animate-pulse` (2s) already reads as "slow"; staggered
// delays create the wave. Respects prefers-reduced-motion globally (see
// globals.css).
export const LoadingIndicator: FC<Props> = (props) => {
  if (!props.isLoading) return null;

  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-flex items-center gap-1")}
    >
      <span className="h-1.5 w-1.5 rounded-pill bg-primary animate-pulse [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 rounded-pill bg-primary animate-pulse [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 rounded-pill bg-primary animate-pulse" />
    </span>
  );
};
