import { removeChatDocumentAction } from "@/features/chat-page/actions/document-actions";
import { DocumentUploader } from "@/features/chat-page/chat-document-uploader";
import { FindAllChatDocumentsForCurrentUser } from "@/features/chat-page/chat-services/chat-document-service";
import { FindAllChatThreadForCurrentUser } from "@/features/chat-page/chat-services/chat-thread-service";
import { Button } from "@/features/ui/button";
import { DisplayError } from "@/features/ui/error/display-error";
import { FileText, Trash2 } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * W6 — `/documents`, a management surface for the files backing this
 * seller's RAG. Reuses `FindAllChatDocumentsForCurrentUser` (userId-scoped,
 * same ownership filter as every other chat-document accessor) — never
 * widens retrieval authorization beyond "documents this signed-in user
 * uploaded".
 */
export default async function DocumentsPage() {
  const [documentsResult, threadsResult] = await Promise.all([
    FindAllChatDocumentsForCurrentUser(),
    FindAllChatThreadForCurrentUser(),
  ]);

  if (documentsResult.status !== "OK") {
    return <DisplayError errors={documentsResult.errors} />;
  }
  if (threadsResult.status !== "OK") {
    return <DisplayError errors={threadsResult.errors} />;
  }

  const documents = documentsResult.response;
  const threadsById = new Map(threadsResult.response.map((t) => [t.id, t]));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 py-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">Coach 360</p>
        <h1 className="font-display text-2xl font-bold text-foreground">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything you&apos;ve uploaded to back Coach 360&apos;s answers with your own material — parsed via
          Document Intelligence and indexed for retrieval.
        </p>
      </header>

      <DocumentUploader threads={threadsResult.response.map((t) => ({ id: t.id, name: t.name }))} />

      {documents.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8 text-center text-muted-foreground">
          No documents yet. Upload one above, or attach a file directly from any chat — it will show up here.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {documents.map((doc) => {
            const thread = threadsById.get(doc.chatThreadId);
            return (
              <div
                key={doc.id}
                className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <FileText size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-foreground">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {thread ? (
                        <>
                          In{" "}
                          <Link href={`/chat/${doc.chatThreadId}`} className="text-primary-text hover:underline">
                            {thread.name}
                          </Link>
                        </>
                      ) : (
                        "Conversation no longer available"
                      )}{" "}
                      · {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <form action={removeChatDocumentAction.bind(null, doc.id)}>
                  <Button type="submit" variant="outline" size="sm" className="min-h-[44px] gap-2">
                    <Trash2 size={14} aria-hidden="true" />
                    Remove
                  </Button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
