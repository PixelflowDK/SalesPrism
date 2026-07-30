import { SALES_COACH_MODULE_REGISTRY, type ModuleKey } from "@/features/sales-coach/models";

/**
 * Onboarding step 2 — 3 context questions (Stage 5c, SAD §18 Phase F).
 * Pure data + a pure derivation function, kept free of any component/store
 * concerns so it can be unit-tested in isolation (same separation pattern
 * as `model-router.ts`'s heuristic step).
 */

export type OnboardingAnswers = {
  /** Free-text — the seller's primary customer segment/industry. */
  customerSegment: string;
  /** Which of the 7 Sales Coach models the seller is most curious about right now. */
  curiousModule: ModuleKey;
  /** Free-text — a deal or customer the seller is actively working on. */
  activeDeal: string;
};

export const DEFAULT_ONBOARDING_ANSWERS: OnboardingAnswers = {
  customerSegment: "",
  curiousModule: "module-01",
  activeDeal: "",
};

/** Options for the "which model are you most curious about" question — mirrors the full registry, in order. */
export const CURIOUS_MODULE_OPTIONS: ModuleKey[] = [
  "module-01",
  "module-02",
  "module-03",
  "module-04",
  "module-05",
  "module-06",
  "module-07",
];

/**
 * Derives exactly 2 starter prompts from the step-2 answers — one grounded
 * in the seller's chosen model, one grounded in their active deal (falling
 * back to their customer segment if they left the deal question blank).
 * Never returns fewer than 2 prompts and never throws — worst case, the
 * fallback copy is generic but still usable.
 */
export const deriveStarterPrompts = (answers: OnboardingAnswers): [string, string] => {
  const moduleDef = SALES_COACH_MODULE_REGISTRY[answers.curiousModule];
  const dealOrSegment = answers.activeDeal.trim() || answers.customerSegment.trim();

  const modelPrompt = `Walk me through the ${moduleDef.name} and help me apply it to a real conversation I'm preparing for.`;

  const dealPrompt = dealOrSegment
    ? `Help me prepare for my next conversation with ${dealOrSegment} — what should I focus on?`
    : "Help me prepare for my next customer conversation — what should I focus on first?";

  return [modelPrompt, dealPrompt];
};
