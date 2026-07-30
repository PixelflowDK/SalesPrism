// DESIGN.md §5.8 — streaming/loading state for the AI Response Block:
// the card container appears first (same anatomy as the finished block),
// with --color-bg-hover shimmer blocks standing in for body copy while
// Coach 360 prepares its answer.
export const ChatLoading = () => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Coach 360 is preparing a response"
      className="animate-ai-block-in flex flex-col gap-3 rounded-md border-l-[3px] border-primary bg-ai px-6 py-5"
    >
      <div className="h-4 w-32 rounded-sm bg-muted animate-pulse" />
      <div className="flex flex-col gap-2">
        <div className="h-3 w-full rounded-sm bg-muted animate-pulse" />
        <div className="h-3 w-5/6 rounded-sm bg-muted animate-pulse" />
        <div className="h-3 w-2/3 rounded-sm bg-muted animate-pulse" />
      </div>
    </div>
  );
};
