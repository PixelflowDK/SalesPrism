import "server-only";

import {
  ServerActionResponse,
  zodErrorsToServerActionErrors,
} from "@/features/common/server-action-response";
import { ConfigContainer } from "@/features/common/services/cosmos";
import { safeLog } from "@/features/common/services/safe-logger";
import { SqlQuerySpec } from "@azure/cosmos";
import {
  ALL_MODULE_KEYS,
  CustomerEntity,
  MODULE_CONFIG_ATTRIBUTE,
  ModuleConfig,
  ModuleConfigEntry,
  ModuleConfigSchema,
  ModuleKey,
  SALES_COACH_MODULE_REGISTRY,
  SalesCoachModuleDefinition,
  VALUE_AREA_LABELS,
} from "./models";

// Re-exported for backward compatibility — every existing import in this
// codebase pulls these from context-injection.ts. models.ts (no
// "server-only" pragma) is now the source of truth so client components
// (e.g. the Help panel's "The 7 models" tab) can import the registry
// without pulling in Cosmos/server-only code — see models.ts doc comment.
export { ALL_MODULE_KEYS, SALES_COACH_MODULE_REGISTRY };
export type { SalesCoachModuleDefinition };

/**
 * Sales Coach Context Injection — SHARED 2 (backlog "Tekniske
 * Fælles-komponenter"). Used by F-01, F-02, F-04 (and F-07 in a later
 * phase). Everything in this file is either a pure string-building function
 * or the per-tenant `ModuleConfig` Cosmos accessor — no chat/tool-calling
 * logic lives here (see `intent-detection.ts` / `meeting-prep-tool.ts`).
 */

// ---------------------------------------------------------------------------
// 1. The 7 Sales Coach modules registry — moved to models.ts (client-safe,
//    no "server-only" pragma) and re-exported above for backward
//    compatibility with every existing import in this codebase.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 2. Per-tenant ModuleConfig — Cosmos ConfigContainer, partitioned on
//    tenantSlug (see models.ts module doc). Seeded all-active on first read,
//    mirroring `EnsureTenantTheme`'s seed-on-first-boot pattern.
// ---------------------------------------------------------------------------

const moduleConfigDocId = (tenantSlug: string) => `sales-coach-modules-${tenantSlug}`;

const buildDefaultModuleConfig = (tenantSlug: string): ModuleConfig => {
  const now = new Date().toISOString();
  return {
    id: moduleConfigDocId(tenantSlug),
    type: MODULE_CONFIG_ATTRIBUTE,
    userId: tenantSlug,
    tenantSlug,
    modules: ALL_MODULE_KEYS.map((key, index) => ({
      key,
      active: true,
      order: index + 1,
      customName: null,
      language: "da",
      contentOverride: null,
    })),
    createdAt: now,
    updatedAt: now,
  };
};

export const GetModuleConfig = async (
  tenantSlug: string
): Promise<ServerActionResponse<ModuleConfig>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query: "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug",
      parameters: [
        { name: "@type", value: MODULE_CONFIG_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
      ],
    };
    const { resources } = await ConfigContainer()
      .items.query<ModuleConfig>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    if (resources.length === 0) {
      return { status: "NOT_FOUND", errors: [{ message: "Module config not found." }] };
    }

    const parsed = ModuleConfigSchema.safeParse(resources[0]);
    if (!parsed.success) {
      return { status: "ERROR", errors: zodErrorsToServerActionErrors(parsed.error.errors) };
    }
    return { status: "OK", response: parsed.data };
  } catch (error) {
    safeLog.error("sales-coach.module-config.get-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load module configuration." }] };
  }
};

/** Seed-on-first-boot — see `EnsureTenantTheme` for the same pattern. */
export const EnsureModuleConfig = async (
  tenantSlug: string
): Promise<ServerActionResponse<ModuleConfig>> => {
  const existing = await GetModuleConfig(tenantSlug);
  if (existing.status === "OK") return existing;
  if (existing.status !== "NOT_FOUND") return existing;

  const seeded = buildDefaultModuleConfig(tenantSlug);
  try {
    const { resource } = await ConfigContainer().items.create<ModuleConfig>(seeded);
    if (resource) return { status: "OK", response: resource };
    safeLog.error("sales-coach.module-config.seed-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to initialize module configuration." }] };
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code === 409) {
      return await GetModuleConfig(tenantSlug);
    }
    safeLog.error("sales-coach.module-config.seed-failed", { tenantSlug, statusCode: code });
    return { status: "ERROR", errors: [{ message: "Unable to initialize module configuration." }] };
  }
};

export type ActiveModuleView = SalesCoachModuleDefinition & Pick<ModuleConfigEntry, "order" | "customName">;

/** Active modules for a tenant, merged with their registry name/essence, ordered per `ModuleConfigEntry.order`. */
export const GetActiveModules = async (tenantSlug: string): Promise<ActiveModuleView[]> => {
  const config = await EnsureModuleConfig(tenantSlug);
  if (config.status !== "OK") return [];

  return config.response.modules
    .filter((m) => m.active)
    .sort((a, b) => a.order - b.order)
    .map((m) => ({ ...SALES_COACH_MODULE_REGISTRY[m.key], order: m.order, customName: m.customName }));
};

// ---------------------------------------------------------------------------
// 3. System prompt builder — SAD §30.4 structure. Pure function, no I/O.
// ---------------------------------------------------------------------------

export type CoachingContext = "meeting-prep" | "conversation-coaching" | null;

/** Minimal, non-PII summary of a matched customer entity for proactive context injection (F-03). */
export type CustomerContextSummary = {
  customerName: string;
  knownChallenges: string[];
  valueAreas: CustomerEntity["valueAreas"];
  contacts: Pick<CustomerEntity["contacts"][number], "name" | "title" | "personaType" | "primaryValueArea">[];
};

export type SalesCoachPersonaContext = {
  assistantName: string;
  coachingContext: CoachingContext;
  customerContext?: CustomerContextSummary | null;
};

const buildModuleSection = (activeModules: ActiveModuleView[]): string => {
  if (activeModules.length === 0) return "";
  const lines = activeModules
    .map((m) => `- ${m.customName ?? m.name}: ${m.essence}`)
    .join("\n");
  return `## Aktiverede Sales Coach modeller\nDu er vejledt i følgende modeller og bruger dem aktivt i dine svar:\n${lines}`;
};

const buildCustomerContextSection = (context: CustomerContextSummary): string => {
  const challenges = context.knownChallenges.length > 0 ? context.knownChallenges.join(", ") : "Ingen registreret endnu";
  const valueAreas =
    context.valueAreas.length > 0
      ? context.valueAreas.map((v) => VALUE_AREA_LABELS[v]).join(", ")
      : "Ingen registreret endnu";
  const contacts =
    context.contacts.length > 0
      ? context.contacts.map((c) => `${c.name} (${c.title})`).join(", ")
      : "Ingen registreret endnu";

  return `## Kendt kunde-kontekst — ${context.customerName}\nBrug denne viden proaktivt, spørg ikke om information du allerede har:\n- Kendte udfordringer: ${challenges}\n- Relevante value areas: ${valueAreas}\n- Kendte kontakter: ${contacts}`;
};

const MEETING_PREP_GUIDANCE = `## Mødeforberedelses-flow (360° Customer Understanding Model)
Sælgeren har bedt om hjælp til at forberede et kundemøde. Følg denne struktur:
1. Stil mindst disse 4 guidende spørgsmål — ét ad gangen, i naturlig samtale, ikke som en formular:
   - Hvad ved du om kundens vision og strategi?
   - Hvem deltager i mødet? Hvad er deres rolle?
   - Hvad er deres primære udfordringer lige nu?
   - Hvilke value areas er mest relevante?
2. Når du har fået brugbare svar på alle 4 (kunde-kontekst ovenfor tæller som allerede besvaret — spørg ikke igen om det du allerede ved), kald funktionen \`meetingPrep\` med en samlet syntese af det du har lært. Kald den ALDRIG før du har stillet spørgsmålene.
3. Når \`meetingPrep\` returnerer et resultat med et \`embedDirective\` felt, svarer du med ÉT kort intro-sætning efterfulgt af \`embedDirective\`-værdien indsat ordret som resten af dit svar. Gengiv IKKE brief-indholdet i almindelig tekst — embed-direktivet er hele visningen.`;

const CONVERSATION_COACHING_GUIDANCE = `## Samtalecoaching (1st/2nd Position Model)
Sælgeren beskriver hvad der skete i et møde eller en samtale. Giv konkret, handlingsrettet feedback:
1. Identificér om sælgerens sprog var 1st Position (fokus på eget produkt/agenda) eller 2nd Position (fokus på kundens verden).
2. Vær specifik — citér eller referér til det sælgeren faktisk skrev.
3. Foreslå mindst én konkret alternativ formulering sælgeren kan bruge næste gang.
4. Kobl feedbacken eksplicit til et navngivet Sales Coach-model (f.eks. "Dette er 1st/2nd Position Model" eller "Dette relaterer til Value Conversation Model").`;

/**
 * Builds the Sales Coach system-prompt block: active-module guidance
 * (SAD §30.4) + optional guided-flow instructions for the active coaching
 * context + optional proactive customer-context injection (F-03).
 *
 * Signature intentionally matches the backlog's
 * `buildSalesCoachSystemPrompt(activeModules, persona)` shape — `persona`
 * here bundles the assistant name, active coaching context and matched
 * customer summary needed across F-01/F-02/F-04.
 */
export const buildSalesCoachSystemPrompt = (
  activeModules: ActiveModuleView[],
  persona: SalesCoachPersonaContext
): string => {
  const sections: string[] = [buildModuleSection(activeModules)];

  if (persona.customerContext) {
    sections.push(buildCustomerContextSection(persona.customerContext));
  }

  if (persona.coachingContext === "meeting-prep") {
    sections.push(MEETING_PREP_GUIDANCE);
  } else if (persona.coachingContext === "conversation-coaching") {
    sections.push(CONVERSATION_COACHING_GUIDANCE);
  }

  return sections.filter((s) => s.length > 0).join("\n\n");
};
