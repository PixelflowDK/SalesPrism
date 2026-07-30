import "server-only";

import { getChatModel } from "@/features/common/services/azure-ai";
import type { PlatformTier } from "@/features/theme/tenant-theme";
import { safeLog } from "@/features/common/services/safe-logger";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * Two-step model routing — SAD v2.7 §18 Phase F, superseded model reality
 * per ADR-001 (docs/architecture-decisions/ADR-001-model-baseline.md).
 *
 * The SAD's original wording (Phi-4 mini -> GPT-4.1 mini -> GPT-4o) is
 * obsolete: the entire GPT-4.x family is deprecated for this subscription,
 * and only `gpt-5.4-mini` currently has DataZoneStandard quota (ADR-001
 * "Subscription-verified availability" table). `gpt-5.4` (Professional) and
 * `gpt-5.5` (Enterprise) are quota-gated as of 2026-07-30.
 *
 * Deliberate design consequence: the deployment map below is ENV-DRIVEN,
 * not hardcoded to model names. `AZURE_OPENAI_CHAT_DEPLOYMENT` (already
 * required by azure-ai.ts) is the always-available default. The optional
 * `_LOW` / `_HIGH` overrides let a customer's Bicep-provisioned Azure
 * OpenAI resource add cheaper/more-capable deployments later (e.g.
 * `gpt-5-nano` once its quota lands, per ADR-001 point 3) WITHOUT a code
 * change — until then, both are unset and every request routes to the
 * default deployment regardless of classified complexity. This function
 * must never return a deployment name that isn't guaranteed to exist.
 */
export const AZURE_OPENAI_CHAT_DEPLOYMENT_LOW: string | undefined =
  process.env.AZURE_OPENAI_CHAT_DEPLOYMENT_LOW || undefined;

export const AZURE_OPENAI_CHAT_DEPLOYMENT_HIGH: string | undefined =
  process.env.AZURE_OPENAI_CHAT_DEPLOYMENT_HIGH || undefined;

export type QueryComplexity = "low" | "medium" | "high";

export type ChatDeploymentMap = {
  /** `AZURE_OPENAI_CHAT_DEPLOYMENT` — always set (azure-ai.ts enforces a fallback literal). */
  default: string;
  /** `AZURE_OPENAI_CHAT_DEPLOYMENT_LOW`, optional — cheaper/faster deployment for trivial queries. */
  low?: string;
  /** `AZURE_OPENAI_CHAT_DEPLOYMENT_HIGH`, optional — more capable deployment for high-complexity queries. */
  high?: string;
};

/** Reads the current deployment map from the environment. Pure aside from `process.env` reads. */
export const resolveChatDeploymentMap = (): ChatDeploymentMap => ({
  default: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || "gpt-5.4-mini",
  low: AZURE_OPENAI_CHAT_DEPLOYMENT_LOW,
  high: AZURE_OPENAI_CHAT_DEPLOYMENT_HIGH,
});

// ---------------------------------------------------------------------------
// Step 1a — cheap heuristic short-circuit (no model call). Pure, synchronous,
// unit-testable in isolation (see tenant-resolver.ts for the same pattern
// used elsewhere in this codebase). Only handles the OBVIOUS ends of the
// spectrum; anything else returns `null` so the caller falls through to the
// model-based classifier (step 1b) instead of guessing.
// ---------------------------------------------------------------------------

/** Trivial greetings/acknowledgements — never worth a classifier round-trip. */
const TRIVIAL_MESSAGE_PATTERN =
  /^(hi|hey|hello|hej|hejsa|tak|thanks|thank you|ok|okay|ja|nej|yes|no|goddag|davs)[!.? ]*$/i;

/**
 * Danish-first (SAD §28) with English fallbacks, matching intent-detection.ts's
 * bilingual convention. Signals multi-stakeholder / strategic / high-stakes
 * reasoning that benefits from the most capable available deployment —
 * mirrors the SAD's "multi-document, kompleks ræsonnering, høj-stakes"
 * description of the top routing tier.
 */
const HIGH_COMPLEXITY_KEYWORDS: RegExp[] = [
  /strateg(i|isk|y)/i,
  /forhandl(e|ing)/i,
  /negotiat/i,
  /konkurrent/i,
  /competitor/i,
  /bestyrelse/i,
  /\bboard\b/i,
  /flerårig/i,
  /multi[- ]year/i,
  /cross[- ]functional/i,
  /tvær(gående|organisatorisk)/i,
  /sammenlign.*(tilbud|leverandør|kontrakt)/i,
  /compare.*(vendors?|contracts?|proposals?)/i,
  /kompleks(e)?\s+(sag|situation|kunde)/i,
];

/** Long/detailed messages are more likely to need multi-hop reasoning over a short one-liner. */
const HIGH_COMPLEXITY_LENGTH_THRESHOLD = 600;

/** Short, single-sentence questions with no complexity signal are cheap FAQ/lookup territory. */
const LOW_COMPLEXITY_LENGTH_THRESHOLD = 40;

export const classifyByHeuristic = (message: string): QueryComplexity | null => {
  const trimmed = message.trim();

  if (trimmed.length === 0) return "low";
  if (TRIVIAL_MESSAGE_PATTERN.test(trimmed)) return "low";

  if (HIGH_COMPLEXITY_KEYWORDS.some((pattern) => pattern.test(trimmed))) return "high";
  if (trimmed.length > HIGH_COMPLEXITY_LENGTH_THRESHOLD) return "high";

  if (trimmed.length <= LOW_COMPLEXITY_LENGTH_THRESHOLD && (trimmed.match(/\?/g)?.length ?? 0) <= 1) {
    return "low";
  }

  // Ambiguous — defer to the model classifier (step 1b).
  return null;
};

// ---------------------------------------------------------------------------
// Step 1b — model-based classifier. Runs ONLY when the heuristic above
// returns null. Always executes on the default (mini/nano-tier) deployment
// per ADR-001 point 3 ("Routing classifier ... gpt-5.4-mini now; migrate to
// gpt-5-nano when quota is granted") — never on `_LOW`/`_HIGH`, since the
// classifier itself must stay on the cheapest available deployment
// regardless of what it ultimately routes the real request to.
// ---------------------------------------------------------------------------

const ComplexityClassificationSchema = z.object({
  complexity: z.enum(["low", "medium", "high"]),
  reason: z.string(),
});

const CLASSIFIER_SYSTEM_PROMPT = `You classify a single sales-coaching chat message by how much reasoning it needs, so the platform can route it to the right-sized AI model. Reply with exactly one of:
- "low": a simple factual/FAQ-style lookup or a narrow, well-structured RAG question with one clear answer.
- "medium": a standard coaching conversation, document analysis, or a normal multi-sentence request — the common case.
- "high": multi-document or multi-stakeholder reasoning, high-stakes negotiation/strategy framing, or a request that requires connecting several distinct pieces of context.
Prefer "medium" when unsure — only choose "low" or "high" when the signal is clear.`;

/**
 * Model-based classification fallback. Never throws: a classifier failure
 * (rate limit, transient Azure OpenAI error, etc.) must never block the
 * chat request it's meant to route — falls back to "medium" (the safe,
 * always-available default deployment) and logs the failure via safeLog.
 */
export const classifyComplexityWithModel = async (
  message: string,
  requestId: string
): Promise<QueryComplexity> => {
  try {
    const { object } = await generateObject({
      model: getChatModel(resolveChatDeploymentMap().default),
      schema: ComplexityClassificationSchema,
      system: CLASSIFIER_SYSTEM_PROMPT,
      prompt: message,
    });
    return object.complexity;
  } catch {
    safeLog.warn("chat.model-router.classifier-failed", { requestId });
    return "medium";
  }
};

// ---------------------------------------------------------------------------
// Step 2 — deployment selection. Pure function, no I/O — the tier gate and
// the "never route to an unset deployment" fallback both live here so they
// can be unit-tested without mocking `generateObject`/Cosmos.
// ---------------------------------------------------------------------------

export type ModelSelection = {
  deploymentName: string;
  complexity: QueryComplexity;
};

/**
 * `tier === "smb"` is this platform's "Standard" pricing tier (see
 * CLAUDE.md's model-tier tag values `standard | professional | enterprise`;
 * `TenantTheme.tier` uses the Cosmos-literal `"smb"` for the same tier —
 * `RecordPromptEvent`'s `process.env.PLATFORM_TIER || "smb"` fallback in
 * chat-handler.ts already treats the two as equivalent). Standard-tier
 * tenants must never escalate above the default deployment, even if a
 * `_HIGH` override happens to be configured — only Professional/Enterprise
 * tenants (or an unresolvable/unknown tier — fail OPEN to normal routing,
 * consistent with this codebase's other tenant-lookup fail-open behavior,
 * e.g. `getRequestTenantTheme` in app/layout.tsx) can escalate.
 *
 * Downgrading to `_LOW` for a trivial query is always allowed at every
 * tier — that's a cost optimization, not a capability the tenant is paying
 * for, so there's nothing to gate.
 */
export const selectDeployment = (
  complexity: QueryComplexity,
  tier: PlatformTier | null | undefined,
  deployments: ChatDeploymentMap
): ModelSelection => {
  if (complexity === "low") {
    return { deploymentName: deployments.low ?? deployments.default, complexity };
  }

  if (complexity === "high" && tier !== "smb") {
    return { deploymentName: deployments.high ?? deployments.default, complexity };
  }

  return { deploymentName: deployments.default, complexity };
};

// ---------------------------------------------------------------------------
// Orchestrator — wires steps 1a/1b/2 together and resolves the actual
// `LanguageModel` instance. This is the only export chat-handler.ts needs.
// ---------------------------------------------------------------------------

export type RouteChatModelInput = {
  message: string;
  tier: PlatformTier | null | undefined;
  requestId: string;
  /**
   * Whether the RAG tool is available for this turn (documents attached to
   * the thread). Documents present means this is never a zero-context
   * trivial lookup — floors a heuristic/classifier "low" result to
   * "medium" so document analysis doesn't get routed to the cheapest tier.
   */
  hasDocuments: boolean;
};

export type RouteChatModelResult = ModelSelection & {
  model: ReturnType<typeof getChatModel>;
};

export const routeChatModel = async (
  input: RouteChatModelInput
): Promise<RouteChatModelResult> => {
  const deployments = resolveChatDeploymentMap();

  let complexity = classifyByHeuristic(input.message);
  if (complexity === null) {
    complexity = await classifyComplexityWithModel(input.message, input.requestId);
  }

  if (input.hasDocuments && complexity === "low") {
    complexity = "medium";
  }

  const selection = selectDeployment(complexity, input.tier, deployments);

  return { ...selection, model: getChatModel(selection.deploymentName) };
};
