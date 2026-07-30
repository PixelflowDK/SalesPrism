import "server-only";

import { getChatModel } from "@/features/common/services/azure-ai";
import { safeLog } from "@/features/common/services/safe-logger";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * STT post-processing — backlog F-02 "AI-rensning og kategorisering".
 *
 * One `generateObject` call (default/mini deployment — same
 * `AZURE_OPENAI_CHAT_DEPLOYMENT` contract as structured-output.ts) that
 * cleans filler words/false starts out of a raw speech-to-text transcript
 * and classifies the seller's intent, so the chat UI can react (e.g. a
 * "meeting-update" auto-starts the F-02 coaching flow via
 * `intent-detection.ts`'s existing keyword path once the cleaned text is
 * sent as a normal message — this module does not itself trigger that flow,
 * it only prepares the text that lands in the editable input field).
 *
 * MUST NEVER block the user: any failure (rate limit, transient error)
 * falls back to the raw transcript unchanged, category "free-chat" — the
 * caller (route handler) always returns 200 with usable text, never
 * surfaces a cleanup failure as a user-facing error.
 */

export const SttIntentCategorySchema = z.enum([
  "meeting-update",
  "customer-observation",
  "question",
  "free-chat",
]);
export type SttIntentCategory = z.infer<typeof SttIntentCategorySchema>;

const SttCleanupResultSchema = z.object({
  category: SttIntentCategorySchema,
  cleanedText: z.string(),
});
export type SttCleanupResult = z.infer<typeof SttCleanupResultSchema>;

const STT_CLEANUP_SYSTEM_PROMPT = `Du renser en rå tale-til-tekst-transskription fra en sælger, uden at ændre meningen.

Regler for "cleanedText":
- Fjern fyldeord (øhh, altså, ikk, hmm) og gentagelser/false starts.
- Ret oplagte tale-til-tekst-fejl og sætningsstruktur, men opfind intet nyt indhold.
- Bevar sprog (dansk/engelsk/norsk/svensk/tysk) og sælgerens egen ordlyd så vidt muligt — dette er en oprydning, ikke en omskrivning.
- Er transskriptionen allerede ren, returér den stort set uændret.

Regler for "category":
- "meeting-update": sælgeren beskriver hvad der skete i et møde/en samtale.
- "customer-observation": sælgeren deler en observation eller et faktum om en kunde/kontakt, uden at beskrive et konkret møde.
- "question": sælgeren stiller et direkte spørgsmål der forventer et svar.
- "free-chat": alt andet.`;

export const cleanupSttTranscript = async (rawText: string): Promise<SttCleanupResult> => {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return { category: "free-chat", cleanedText: rawText };
  }

  try {
    const { object } = await generateObject({
      model: getChatModel(),
      schema: SttCleanupResultSchema,
      system: STT_CLEANUP_SYSTEM_PROMPT,
      prompt: trimmed,
    });
    return object;
  } catch {
    safeLog.warn("sales-coach.stt-cleanup-failed");
    return { category: "free-chat", cleanedText: rawText };
  }
};
