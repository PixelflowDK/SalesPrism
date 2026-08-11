import { CoachForm } from "@/features/sales-coach/components/coach-form";
import { FindChatThreadsByCoachingContext } from "@/features/chat-page/chat-services/chat-thread-service";
import { DisplayError } from "@/features/ui/error/display-error";
import { MessageSquareText } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * W3 — `/coach`, first-class Conversation Coaching (F-02). See
 * `coach-form.tsx` doc-comment for how this hands off into the existing,
 * unmodified conversation-coaching chat pipeline.
 */
export default async function CoachPage() {
  const historyResult = await FindChatThreadsByCoachingContext("conversation-coaching");

  if (historyResult.status !== "OK") {
    return <DisplayError errors={historyResult.errors} />;
  }

  const sessions = historyResult.response;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-8 py-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">Coach 360 · F-02</p>
        <h1 className="font-display text-2xl font-bold text-foreground">Get coaching on a conversation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe what happened and Coach 360 analyzes it against the Sales Coach models — 1st vs 2nd Position,
          concrete alternative wording, named model references.
        </p>
      </header>

      <CoachForm />

      <section aria-labelledby="coach-history-heading">
        <h2 id="coach-history-heading" className="font-display text-lg font-bold text-foreground">
          Past coaching sessions
        </h2>
        {sessions.length === 0 ? (
          <div className="mt-3 rounded-md border border-border bg-card p-5 text-sm text-muted-foreground">
            No coaching sessions yet. Describe a meeting above and it will show up here so you can revisit the
            feedback later.
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {sessions.map((thread) => (
              <Link
                key={thread.id}
                href={`/chat/${thread.id}`}
                className="flex min-h-[44px] items-center gap-3 rounded-md border border-border bg-card p-4 transition-colors hover:border-primary"
              >
                <MessageSquareText size={18} className="shrink-0 text-tertiary" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-display text-base font-bold text-foreground">{thread.name}</p>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {new Date(thread.lastMessageAt).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
