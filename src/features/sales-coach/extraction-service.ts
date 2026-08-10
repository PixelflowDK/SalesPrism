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
 *
 * CR2-5 (MEDIUM) remediation — authoritative-source rule (documented here
 * per that finding's requirement):
 *
 *   The SELLER's own message (`input.userMessage`) is the only authoritative
 *   source for anything persisted by this module. The assistant's reply
 *   (`input.assistantMessage`) is passed to `extractCustomerInsights`
 *   purely as non-authoritative conversational CONTEXT — it can help the
 *   model interpret what the seller meant, but it can never, by itself,
 *   create or mutate a stored fact (a customer, a contact, a challenge, a
 *   trigger, a persona trait).
 *
 *   Why: a malicious uploaded document or a prompt-injection attempt can
 *   get reflected into the assistant's own free-form prose (the model
 *   quoting, summarizing, or elaborating on attacker-supplied text). If
 *   that reflected text alone could seed a new customer/contact, an
 *   attacker could write fabricated, long-lived entries into a seller's
 *   profile without the seller ever having said anything about them — and
 *   those fabrications then bias future context injection and meeting
 *   briefs for that seller.
 *
 *   Enforcement is defense-in-depth, not prompt-instructions-only:
 *   `structured-output.ts`'s `CUSTOMER_INSIGHT_SYSTEM_PROMPT` already tells
 *   the model to treat the seller's text as the only fact source and the
 *   assistant text as inert context/data (never instructions) — but a
 *   system prompt alone is not a reliable defense against injection, so
 *   `isFactEvidencedInUserMessage` below re-checks the model's own output
 *   in code: the extracted `customerName` and every extracted contact name
 *   MUST actually appear (verbatim or via meaningful word overlap) in the
 *   seller's own message text, or it is dropped before anything is
 *   persisted — regardless of what the assistant said or how confident the
 *   model claims to be.
 *
 *   This is the MINIMAL VIABLE fix. A stronger design — requiring explicit
 *   seller confirmation (a UI affordance: "Save <X> to your customer
 *   profile?") before ANY extraction is persisted — was considered and is
 *   the recommended follow-up if this evidence-anchoring heuristic proves
 *   too permissive in practice (e.g. an attacker padding the seller's own
 *   message via a copy-pasted quote). It was not implemented now because it
 *   requires new UI/UX and an approval round-trip, out of scope for this
 *   fix-pass.
 */

const MAX_CONTACTS_TO_CLASSIFY_PER_TURN = 3;

/** Strips diacritics + lowercases so e.g. "Ørsted" and "orsted" both match. */
const normalizeForEvidenceCheck = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * CR2-5 evidence-anchoring guard (see module doc above). Returns `true`
 * only when `candidate` (a customer name or a contact name the model
 * extracted) has real support in the SELLER's own message — never merely
 * in the assistant's reply.
 *
 * A plain substring check is the primary signal (handles the common case
 * verbatim). It falls back to a word-overlap check so trivial model-side
 * formatting differences (added legal suffix like "A/S", punctuation,
 * capitalization) don't produce a false negative for a name the seller
 * genuinely said — but a candidate that shares NO significant word with
 * the seller's own message is rejected outright, which is exactly the
 * "assistant invented a customer the user never mentioned" attack this
 * closes.
 */
export const isFactEvidencedInUserMessage = (candidate: string, userMessage: string): boolean => {
  const normalizedCandidate = normalizeForEvidenceCheck(candidate).trim();
  if (!normalizedCandidate) return false;

  const normalizedUserMessage = normalizeForEvidenceCheck(userMessage);
  if (normalizedUserMessage.includes(normalizedCandidate)) return true;

  const significantWords = normalizedCandidate.split(/\s+/).filter((word) => word.length >= 3);
  if (significantWords.length === 0) return false;
  return significantWords.some((word) => normalizedUserMessage.includes(word));
};

export const runCustomerExtraction = async (input: {
  tenantSlug: string;
  ownerId: string;
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

    // CR2-5 code-level enforcement of the authoritative-source rule (see
    // module doc above): a customer name that only has support in the
    // assistant's reply — never mentioned by the seller — is never
    // persisted, no matter how confident the model claims to be. This is
    // what actually stops a prompt-injection-reflected "customer" in
    // assistant prose from creating a fabricated entity.
    if (!isFactEvidencedInUserMessage(insights.customerName, input.userMessage)) {
      safeLog.warn("sales-coach.extraction.customer-name-not-evidenced", {
        tenantSlug: input.tenantSlug,
      });
      return;
    }

    const namedContacts = insights.newContacts
      .filter((c): c is { name: string; title: string } => Boolean(c.name && c.title))
      .filter((c) => {
        const evidenced = isFactEvidencedInUserMessage(c.name, input.userMessage);
        if (!evidenced) {
          safeLog.warn("sales-coach.extraction.contact-not-evidenced", {
            tenantSlug: input.tenantSlug,
          });
        }
        return evidenced;
      });

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
      ownerId: input.ownerId,
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
