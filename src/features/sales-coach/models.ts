import { z } from "zod";

/**
 * Sales Coach 360 — shared domain schemas (SHARED 1/2/3, Stage 5b / Phase E).
 *
 * Backlog reference: docs/Sales_Coach_360_Feature_Backlog.md F-01..F-04.
 * SAD reference: docs/Sales_Prism_SAD_v2.7.md §18 Phase E, §27 (learning
 * modules), §30 (persona architecture).
 *
 * Cosmos container/partition convention — IMPORTANT DEVIATION FROM THE
 * BACKLOG'S ILLUSTRATIVE JSON: the backlog's example customer-entity JSON
 * (F-03) names its per-seller identity field "userId" (e.g.
 * "usr-peter-hansen"). This app's `ConfigContainer` (see
 * src/features/common/services/cosmos.ts) has a FIXED partition key path of
 * `/userId`, and the established convention for every other tenant-scoped
 * document in this codebase (TenantTheme, UserAccount, ActivityEvent — see
 * tenant-theme.ts / user-service.ts / activity-service.ts) is: the `userId`
 * field on the DOCUMENT holds the *tenant slug* (so "all docs for my
 * tenant" is always a single, cheap, partition-scoped query), and the
 * actual acting/owning user's SHA-256 hashed identity is carried in a
 * separate, differently-named field (`hashedId` / `actorHashedId`).
 *
 * Customer-entity and meeting-brief documents follow that SAME convention
 * here, not the backlog's literal field name, to stay consistent with every
 * other container-owning service in the app. The per-seller identity field
 * is named `ownerHashedId` and — per the Stage 5b brief — is included in
 * EVERY query filter alongside the tenant partition key. This is a hard
 * security boundary: a seller's customer intelligence is private to that
 * seller, and omitting `ownerHashedId` from a query filter is a
 * cross-user data leakage bug.
 */

export const CUSTOMER_ENTITY_ATTRIBUTE = "SALES_COACH_CUSTOMER_ENTITY";
export const MODULE_CONFIG_ATTRIBUTE = "SALES_COACH_MODULE_CONFIG";
export const MEETING_BRIEF_ATTRIBUTE = "SALES_COACH_MEETING_BRIEF";

/**
 * The 5 Value Conversation Model value areas (SAD §27.2 module-04 / DESIGN.md
 * value-area mini-cards).
 */
export const ValueAreaSchema = z.enum([
  "speed-agility",
  "people-processes",
  "risk-governance",
  "economics-control",
  "sustainability-responsibility",
]);
export type ValueArea = z.infer<typeof ValueAreaSchema>;

export const VALUE_AREA_LABELS: Record<ValueArea, string> = {
  "speed-agility": "Speed & Agility",
  "people-processes": "People & Processes",
  "risk-governance": "Risk & Governance",
  "economics-control": "Economics & Control",
  "sustainability-responsibility": "Sustainability & Responsibility",
};

/** Personas & Stakeholder Model (SAD §27.2 module-03) organisational level. */
export const OrgLevelSchema = z.enum(["strategic", "tactical", "operational"]);
export type OrgLevel = z.infer<typeof OrgLevelSchema>;

/**
 * Persona archetypes — two per organisational level, matching the shape of
 * the backlog's F-04 worked example ("Tactical — The Translator"). The SAD
 * does not enumerate the full archetype list verbatim, so this set is a
 * deliberate, documented product decision for the Personas & Stakeholder
 * Model (module-03) classifier — revisit with Kristjan/Carsten if the Sales
 * Coach methodology defines a different canonical list.
 */
export const PersonaTypeSchema = z.enum([
  "strategic-visionary",
  "strategic-guardian",
  "tactical-translator",
  "tactical-coordinator",
  "operational-specialist",
  "operational-gatekeeper",
]);
export type PersonaType = z.infer<typeof PersonaTypeSchema>;

export const PERSONA_TYPE_LABELS: Record<PersonaType, string> = {
  "strategic-visionary": "Strategic — The Visionary",
  "strategic-guardian": "Strategic — The Guardian",
  "tactical-translator": "Tactical — The Translator",
  "tactical-coordinator": "Tactical — The Coordinator",
  "operational-specialist": "Operational — The Specialist",
  "operational-gatekeeper": "Operational — The Gatekeeper",
};

export const PERSONA_TYPE_ORG_LEVEL: Record<PersonaType, OrgLevel> = {
  "strategic-visionary": "strategic",
  "strategic-guardian": "strategic",
  "tactical-translator": "tactical",
  "tactical-coordinator": "tactical",
  "operational-specialist": "operational",
  "operational-gatekeeper": "operational",
};

export const CustomerContactSchema = z.object({
  name: z.string(),
  title: z.string(),
  personaType: PersonaTypeSchema.nullable(),
  primaryValueArea: ValueAreaSchema.nullable(),
  secondaryValueArea: ValueAreaSchema.nullable().optional(),
  knownTriggers: z.array(z.string()).default([]),
  communicationTips: z.array(z.string()).default([]),
  suggestedQuestions: z.array(z.string()).default([]),
  notes: z.string().default(""),
});
export type CustomerContact = z.infer<typeof CustomerContactSchema>;

/**
 * Customer-entity — F-03 persistent customer intelligence. Cosmos document
 * shape per backlog F-03 §Datamodel, adjusted for the `ownerHashedId`
 * partition/ownership convention documented in the module doc-comment above.
 */
export const CustomerEntitySchema = z.object({
  id: z.string(),
  type: z.literal(CUSTOMER_ENTITY_ATTRIBUTE),
  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
  userId: z.string(),
  tenantSlug: z.string(),
  /** SHA-256 hash of the owning seller's email — the seller-scoping boundary. Never the raw email. */
  ownerHashedId: z.string(),
  customerName: z.string(),
  /** Lowercased/trimmed `customerName`, for case-insensitive `FindByCustomerName` lookups. */
  customerNameNormalized: z.string(),
  contacts: z.array(CustomerContactSchema).default([]),
  knownChallenges: z.array(z.string()).default([]),
  /** ISO date string of the most recent chat interaction that touched this customer. */
  lastInteraction: z.string(),
  /** Saved MeetingBrief document ids (F-01), most recent last. */
  meetingHistory: z.array(z.string()).default([]),
  valueAreas: z.array(ValueAreaSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomerEntity = z.infer<typeof CustomerEntitySchema>;

/** SAD §27.2 — the 7 standard Sales Coach modules. */
export const ModuleKeySchema = z.enum([
  "module-01",
  "module-02",
  "module-03",
  "module-04",
  "module-05",
  "module-06",
  "module-07",
]);
export type ModuleKey = z.infer<typeof ModuleKeySchema>;

/** Per-tenant module toggle/order entry — SAD §27.3. */
export const ModuleConfigEntrySchema = z.object({
  key: ModuleKeySchema,
  active: z.boolean(),
  order: z.number().int(),
  customName: z.string().nullable(),
  language: z.string(),
  /** Points at a customer-specific content override (Atea-model, SAD §27.4) — not resolved by this shared component. */
  contentOverride: z.string().nullable(),
});
export type ModuleConfigEntry = z.infer<typeof ModuleConfigEntrySchema>;

export const ModuleConfigSchema = z.object({
  id: z.string(),
  type: z.literal(MODULE_CONFIG_ATTRIBUTE),
  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
  userId: z.string(),
  tenantSlug: z.string(),
  modules: z.array(ModuleConfigEntrySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ModuleConfig = z.infer<typeof ModuleConfigSchema>;

/** F-01 meeting brief — one value-area theme with an impact rating (DESIGN.md §5.3 mini-card). */
export const MeetingBriefValueThemeSchema = z.object({
  valueArea: ValueAreaSchema,
  theme: z.string(),
  impact: z.enum(["low", "medium", "high"]),
});
export type MeetingBriefValueTheme = z.infer<typeof MeetingBriefValueThemeSchema>;

export const MeetingBriefDiscoveryQuestionsSchema = z.object({
  personaType: PersonaTypeSchema,
  questions: z.array(z.string()).min(1),
});

export const MeetingBriefFramingSchema = z.object({
  type: z.enum(["burning-platform", "burning-ambition"]),
  narrative: z.string(),
});

/** Structured MeetingBrief document body — see structured-output.ts for the generation schema. */
export const MeetingBriefSchema = z.object({
  customerName: z.string(),
  meetingTopic: z.string(),
  /** 2nd Position opening questions (backlog F-01 acceptance criterion). */
  openingQuestions: z.array(z.string()).min(2),
  valueAreaThemes: z.array(MeetingBriefValueThemeSchema),
  discoveryQuestionsByPersona: z.array(MeetingBriefDiscoveryQuestionsSchema),
  framing: MeetingBriefFramingSchema,
  nextSteps: z.array(z.string()).default([]),
});
export type MeetingBrief = z.infer<typeof MeetingBriefSchema>;

/** Saved/persisted MeetingBrief Cosmos document (F-01: "Brief kan gemmes og genåbnes"). */
export const MeetingBriefDocumentSchema = z.object({
  id: z.string(),
  type: z.literal(MEETING_BRIEF_ATTRIBUTE),
  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
  userId: z.string(),
  tenantSlug: z.string(),
  ownerHashedId: z.string(),
  chatThreadId: z.string(),
  customerEntityId: z.string().nullable(),
  brief: MeetingBriefSchema,
  createdAt: z.string(),
});
export type MeetingBriefDocument = z.infer<typeof MeetingBriefDocumentSchema>;
