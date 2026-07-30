import "server-only";

import { safeLog } from "@/features/common/services/safe-logger";
import { UpsertCustomerEntityFromExtraction } from "./customer-entity-service";
import { CustomerContact } from "./models";
import { classifyPersona, extractCustomerInsights } from "./structured-output";

/**
 * F-03 (Kunde-Intelligens) + F-04 (Persona-Kortlægning) — onFinish
 * extraction orchestration.
 *
 * Called from `chat-handler.ts`'s `onFinish` as `void runCustomerExtraction(...)`
 * — fire-and-forget, NEVER awaited by the request/response path. Every
 * failure is caught internally and reported via `safeLog` only (error
 * code + tenant/thread ids — never prompt or response text, per CLAUDE.md
 * "NEVER log prompt text"). A Cosmos hiccup or a bad `generateObject` call
 * here must never surface to the seller or delay the chat response, which
 * has already finished streaming by the time this runs.
 *
 * Design: a single `extractCustomerInsights` call detects the customer name,
 * new contacts (name + title only), challenges and mentioned value areas
 * from the just-completed exchange. Only when a contact was extracted WITH
 * both a name and a title does this proceed to a second, per-contact
 * `classifyPersona` call (F-04's "PersonaClassification runs ... when a
 * person+title appears") — bounded to the first 3 contacts per turn to cap
 * latency/cost on multi-attendee messages. The customer entity is only
 * created/updated when `customerNameConfidence` is "high" — "medium"/"low"
 * matches are deliberately dropped rather than risk building an incorrect
 * customer profile from a guess.
 */

const MAX_CONTACTS_TO_CLASSIFY_PER_TURN = 3;

export const runCustomerExtraction = async (input: {
  tenantSlug: string;
  ownerHashedId: string;
  userMessage: string;
  assistantMessage: string;
}): Promise<void> => {
  try {
    const insights = await extractCustomerInsights({
      userMessage: input.userMessage,
      assistantMessage: input.assistantMessage,
    });

    if (!insights.customerName || insights.customerNameConfidence !== "high") {
      return;
    }

    const namedContacts = insights.newContacts.filter(
      (c): c is { name: string; title: string } => Boolean(c.name && c.title)
    );

    const classifiedContacts: CustomerContact[] = [];
    for (const contact of namedContacts.slice(0, MAX_CONTACTS_TO_CLASSIFY_PER_TURN)) {
      try {
        const persona = await classifyPersona({
          name: contact.name,
          title: contact.title,
          context: `${input.userMessage}\n${input.assistantMessage}`,
        });

        classifiedContacts.push({
          name: persona.name,
          title: persona.title,
          personaType: persona.personaType,
          primaryValueArea: persona.primaryValueArea,
          secondaryValueArea: persona.secondaryValueArea,
          knownTriggers: persona.knownTriggers,
          communicationTips: persona.communicationTips,
          suggestedQuestions: persona.suggestedQuestions,
          notes: "",
        });
      } catch (error) {
        safeLog.error("sales-coach.extraction.persona-classify-failed", {
          tenantSlug: input.tenantSlug,
        });
        // Fall back to an unclassified contact record rather than dropping it entirely.
        classifiedContacts.push({
          name: contact.name,
          title: contact.title,
          personaType: null,
          primaryValueArea: null,
          secondaryValueArea: null,
          knownTriggers: [],
          communicationTips: [],
          suggestedQuestions: [],
          notes: "",
        });
      }
    }

    const result = await UpsertCustomerEntityFromExtraction({
      tenantSlug: input.tenantSlug,
      ownerHashedId: input.ownerHashedId,
      customerName: insights.customerName,
      newChallenges: [...insights.newChallenges, ...insights.newTriggers],
      newValueAreas: insights.mentionedValueAreas,
      newContacts: classifiedContacts,
    });

    if (result.status !== "OK") {
      safeLog.error("sales-coach.extraction.upsert-failed", { tenantSlug: input.tenantSlug });
    }
  } catch (error) {
    safeLog.error("sales-coach.extraction.failed", { tenantSlug: input.tenantSlug });
  }
};
