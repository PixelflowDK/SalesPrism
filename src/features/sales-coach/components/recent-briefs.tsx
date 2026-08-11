import Link from "next/link";
import { MeetingBriefDocument } from "../models";

/**
 * Shared "recent briefs" list card — reused by `/home` (W1) and `/prepare`
 * (W2) so both surfaces render saved meeting briefs identically to
 * `/briefs`, without duplicating the AI Response Block itself (that stays
 * `<MeetingBrief>`, rendered only on `/briefs/[id]` and inline in chat).
 */
export const RecentBriefs = ({
  briefs,
  emptyHint,
}: {
  briefs: MeetingBriefDocument[];
  emptyHint: React.ReactNode;
}) => {
  if (briefs.length === 0) {
    return <div className="rounded-md border border-border bg-card p-5 text-sm text-muted-foreground">{emptyHint}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {briefs.map((doc) => (
        <Link
          key={doc.id}
          href={`/briefs/${doc.id}`}
          className="flex min-h-[44px] items-center justify-between rounded-md border border-border bg-card p-4 transition-colors hover:border-primary"
        >
          <div>
            <p className="font-display text-base font-bold text-foreground">{doc.brief.customerName}</p>
            <p className="text-sm text-muted-foreground">{doc.brief.meetingTopic}</p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {new Date(doc.createdAt).toLocaleDateString()}
          </span>
        </Link>
      ))}
    </div>
  );
};
