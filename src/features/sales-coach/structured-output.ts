import "server-only";

import { getChatModel } from "@/features/common/services/azure-ai";
import { generateObject } from "ai";
import { z } from "zod";
import {
  MeetingBrief,
  MeetingBriefSchema,
  OrgLevelSchema,
  PERSONA_TYPE_LABELS,
  PersonaType,
  PersonaTypeSchema,
  ValueArea,
  ValueAreaSchema,
} from "./models";
import { SALES_COACH_MODULE_REGISTRY } from "./context-injection";

/**
 * Structured Output — SHARED 3 (backlog "Tekniske Fælles-komponenter").
 * Used by F-01, F-04 (and F-05 in a later phase).
 *
 * Every helper here uses `generateObject` (non-streaming) against the
 * Standard-tier chat deployment via `getChatModel()` — the same
 * `AZURE_OPENAI_CHAT_DEPLOYMENT` env contract `chat-handler.ts` already
 * uses for `streamText`, per CLAUDE.md ("No API keys anywhere" /
 * DefaultAzureCredential — `azure-ai.ts` already enforces this, nothing
 * new is introduced here).
 */

// ---------------------------------------------------------------------------
// MeetingBrief — F-01
// ---------------------------------------------------------------------------

const MEETING_BRIEF_SYSTEM_PROMPT = `Du er en Sales Coach 360 mødeforberedelses-motor. Generér et struktureret møde-brief baseret udelukkende på den information sælgeren har givet.

Anvend disse Sales Coach-modeller:
- ${SALES_COACH_MODULE_REGISTRY["module-01"].name}: ${SALES_COACH_MODULE_REGISTRY["module-01"].essence}
- ${SALES_COACH_MODULE_REGISTRY["module-02"].name}: ${SALES_COACH_MODULE_REGISTRY["module-02"].essence}
- ${SALES_COACH_MODULE_REGISTRY["module-04"].name}: ${SALES_COACH_MODULE_REGISTRY["module-04"].essence}

Krav:
- "openingQuestions" skal være konkrete 2nd Position-spørgsmål (fokuserer på kundens verden, ikke egne produkter) — mindst 2.
- "valueAreaThemes" skal pege på de value areas der er mest relevante ud fra det sælgeren har delt, med en impact-vurdering.
- "discoveryQuestionsByPersona" skal give konkrete spørgsmål per nævnt/kendt persona-type.
- "framing" skal vælge enten "burning-platform" (akut problem der presser på) eller "burning-ambition" (fremadrettet mulighed), afhængigt af hvad der passer bedst til den delte kontekst.
- Opfind ikke fakta om kunden — brug kun det der er blevet delt eller er en rimelig, tydeligt markeret antagelse.`;

export type GenerateMeetingBriefInput = {
  customerName: string;
  meetingTopic: string;
  /** Synthesis of the guided 360° Q&A (vision/strategy, attendees & roles, challenges, value areas). */
  conversationContext: string;
  /** Optional known customer intel (F-03) to ground the brief in prior history instead of re-asking. */
  existingCustomerSummary?: string;
};

export const generateMeetingBrief = async (
  input: GenerateMeetingBriefInput
): Promise<MeetingBrief> => {
  const prompt = [
    `Kunde: ${input.customerName}`,
    `Møde-emne: ${input.meetingTopic}`,
    `Sælgerens input fra den guidede forberedelse:\n${input.conversationContext}`,
    input.existingCustomerSummary
      ? `Kendt kunde-historik (brug proaktivt, spørg ikke om det igen):\n${input.existingCustomerSummary}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { object } = await generateObject({
    model: getChatModel(),
    schema: MeetingBriefSchema,
    system: MEETING_BRIEF_SYSTEM_PROMPT,
    prompt,
  });

  return object;
};

// ---------------------------------------------------------------------------
// CustomerInsightExtraction — F-03
// ---------------------------------------------------------------------------

export const CustomerInsightExtractionSchema = z.object({
  /** `null` when no customer/account is confidently identifiable in this exchange. */
  customerName: z.string().nullable(),
  customerNameConfidence: z.enum(["high", "medium", "low"]),
  newContacts: z
    .array(
      z.object({
        name: z.string(),
        title: z.string().nullable(),
      })
    )
    .default([]),
  newChallenges: z.array(z.string()).default([]),
  newTriggers: z.array(z.string()).default([]),
  mentionedValueAreas: z.array(ValueAreaSchema).default([]),
});
export type CustomerInsightExtraction = z.infer<typeof CustomerInsightExtractionSchema>;

const CUSTOMER_INSIGHT_SYSTEM_PROMPT = `Du udtrækker struktureret kunde-intelligens fra én chat-udveksling mellem en sælger og en AI-salgscoach — for at bygge en vedvarende kunde-profil (aldrig for at besvare brugeren).

Regler:
- Sæt kun "customerName" hvis et konkret kunde/virksomhedsnavn er nævnt — ikke en generisk beskrivelse som "min kunde".
- "customerNameConfidence" = "high" kun hvis navnet er utvetydigt og gentages/bekræftes i konteksten; ellers "medium" eller "low".
- "newContacts" skal kun indeholde personer med et navn — udelad rene rolle-omtaler uden navn.
- Udtræk kun information der faktisk blev sagt — opfind intet.
- Er der ingen kunde-relevant information i udvekslingen, returér null/tomme lister.`;

export const extractCustomerInsights = async (input: {
  userMessage: string;
  assistantMessage: string;
}): Promise<CustomerInsightExtraction> => {
  const { object } = await generateObject({
    model: getChatModel(),
    schema: CustomerInsightExtractionSchema,
    system: CUSTOMER_INSIGHT_SYSTEM_PROMPT,
    prompt: `Sælger:\n${input.userMessage}\n\nAI-salgscoach:\n${input.assistantMessage}`,
  });

  return object;
};

// ---------------------------------------------------------------------------
// PersonaClassification — F-04
// ---------------------------------------------------------------------------

export const PersonaClassificationSchema = z.object({
  name: z.string(),
  title: z.string(),
  orgLevel: OrgLevelSchema,
  personaType: PersonaTypeSchema,
  primaryValueArea: ValueAreaSchema,
  secondaryValueArea: ValueAreaSchema.nullable(),
  knownTriggers: z.array(z.string()).default([]),
  communicationTips: z.array(z.string()).min(1),
  suggestedQuestions: z.array(z.string()).min(1),
});
export type PersonaClassification = z.infer<typeof PersonaClassificationSchema>;

const PERSONA_CLASSIFICATION_SYSTEM_PROMPT = `Du klassificerer en navngiven stakeholder i Sales Coach Personas & Stakeholder Model-terminologi, ud fra hvad sælgeren har delt om personen.

Gyldige persona-typer: ${Object.entries(PERSONA_TYPE_LABELS)
  .map(([key, label]) => `${key} (${label})`)
  .join(", ")}.

Regler:
- Vælg "orgLevel" og "personaType" ud fra titel + kontekst (fx en IT-direktør er typisk "tactical", en CFO/CEO typisk "strategic").
- "communicationTips" og "suggestedQuestions" skal være konkrete og handlingsrettede — mindst ét hver.
- Gæt ikke på fakta der ikke er nævnt — men du MÅ udlede en rimelig persona-klassificering fra titel + kontekst, det er selve opgaven.`;

export const classifyPersona = async (input: {
  name: string;
  title: string;
  context: string;
}): Promise<PersonaClassification> => {
  const { object } = await generateObject({
    model: getChatModel(),
    schema: PersonaClassificationSchema,
    system: PERSONA_CLASSIFICATION_SYSTEM_PROMPT,
    prompt: `Person: ${input.name}\nTitel: ${input.title}\nKontekst fra samtalen:\n${input.context}`,
  });

  return object;
};

export type { ValueArea, PersonaType };
