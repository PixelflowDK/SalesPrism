import "server-only";

import { safeLog } from "@/features/common/services/safe-logger";
import { tool } from "ai";
import { z } from "zod";
import { FindCustomerEntityByName } from "./customer-entity-service";
import { CreateMeetingBrief } from "./meeting-brief-service";
import { generateMeetingBrief } from "./structured-output";
import { CustomerEntity, VALUE_AREA_LABELS } from "./models";

/**
 * F-01 — the model-initiated half of the meeting-prep flow (the keyword
 * heuristic half lives in `intent-detection.ts`). The model calls this tool
 * once it has walked the seller through the 4 guiding 360° questions (see
 * the `MEETING_PREP_GUIDANCE` system-prompt block in `context-injection.ts`)
 * — never before.
 *
 * Rendering contract, mirroring `rag-tool.ts`'s citation-directive pattern:
 * the tool does NOT return brief content for the model to restate in prose.
 * It returns a small `embedDirective` string
 * (`{% meeting-brief id="..." /%}`) that the model is instructed (system
 * prompt) to emit verbatim as its answer. `markdown/config.tsx` registers a
 * matching Markdoc tag that renders the saved brief as the DESIGN.md §5.3 AI
 * Response Block via `<MeetingBriefEmbed>`.
 */
export const createMeetingPrepTool = (props: {
  tenantSlug: string;
  ownerHashedId: string;
  chatThreadId: string;
}) => {
  const { tenantSlug, ownerHashedId, chatThreadId } = props;

  return tool({
    description:
      "Generates and saves a structured meeting-preparation brief for the named customer. " +
      "Call this ONLY after asking the seller the 4 guiding 360° Customer Understanding questions " +
      "(vision/strategy, meeting attendees & roles, current challenges, relevant value areas) and receiving usable answers — " +
      "known customer context already provided in the system prompt counts as already answered. " +
      "After this tool returns successfully, respond with one short sentence plus the returned `embedDirective` value inserted verbatim as the rest of your answer — do not restate the brief content in prose.",
    inputSchema: z.object({
      customerName: z.string().describe("The customer/account name the meeting is with"),
      meetingTopic: z.string().describe("What the meeting is about"),
      conversationContext: z
        .string()
        .describe(
          "A synthesis of everything the seller shared across the 4 guiding questions: vision/strategy, attendees & roles, challenges, relevant value areas"
        ),
    }),
    execute: async ({ customerName, meetingTopic, conversationContext }) => {
      try {
        const existingEntity = await FindCustomerEntityByName(tenantSlug, ownerHashedId, customerName);
        const existingCustomerSummary =
          existingEntity.status === "OK" ? summarizeExistingCustomer(existingEntity.response) : undefined;

        const brief = await generateMeetingBrief({
          customerName,
          meetingTopic,
          conversationContext,
          existingCustomerSummary,
        });

        const saved = await CreateMeetingBrief({
          tenantSlug,
          ownerHashedId,
          chatThreadId,
          customerEntityId: existingEntity.status === "OK" ? existingEntity.response.id : null,
          brief,
        });

        if (saved.status !== "OK") {
          safeLog.error("sales-coach.meeting-prep.save-failed", { tenantSlug });
          return { error: "Unable to save the meeting brief right now. Please try again." };
        }

        return {
          briefId: saved.response.id,
          customerName,
          embedDirective: `{% meeting-brief id="${saved.response.id}" /%}`,
        };
      } catch (error) {
        safeLog.error("sales-coach.meeting-prep.generate-failed", { tenantSlug });
        return { error: "Unable to generate the meeting brief right now. Please try again." };
      }
    },
  });
};

const summarizeExistingCustomer = (entity: CustomerEntity): string => {
  const challenges = entity.knownChallenges.length > 0 ? entity.knownChallenges.join(", ") : "none recorded";
  const valueAreas =
    entity.valueAreas.length > 0 ? entity.valueAreas.map((v) => VALUE_AREA_LABELS[v]).join(", ") : "none recorded";
  const contacts =
    entity.contacts.length > 0
      ? entity.contacts.map((c) => `${c.name} (${c.title})`).join(", ")
      : "none recorded";
  return `Known challenges: ${challenges}. Relevant value areas: ${valueAreas}. Known contacts: ${contacts}.`;
};
