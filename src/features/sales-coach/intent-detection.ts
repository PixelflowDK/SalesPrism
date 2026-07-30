import { CoachingContext } from "./context-injection";

/**
 * Lightweight, dependency-free keyword classifier for F-01 (meeting-prep)
 * and F-02 (conversation-coaching) intent detection — deliberately NOT an
 * AI call. The brief calls for "keyword heuristics + the model itself via a
 * 'meetingPrep' tool the model can call" — this module is the keyword half;
 * `meeting-prep-tool.ts` is the model-initiated half (the model calls the
 * tool once it has gathered enough information, regardless of whether the
 * keyword heuristic fired on the triggering message).
 *
 * Danish-first (primary Nordic customer language, SAD §28) with English
 * fallbacks — matches the bilingual tone requirement in DESIGN.md §1.6.
 */

const MEETING_PREP_PATTERNS: RegExp[] = [
  /forbered(e|t)?\s+mig/i,
  /m[øo]deforberedelse/i,
  /forbered.*(m[øo]de|kunde)/i,
  /prepare( me)?\s+for\s+a\s+meeting/i,
  /meeting\s+prep(aration)?/i,
  /help me prepare/i,
];

const CONVERSATION_COACHING_PATTERNS: RegExp[] = [
  /jeg (havde|startede|gennemf[øo]rte|holdt)\s+(et\s+)?m[øo]de/i,
  /kunden\s+(virkede|sagde|reagerede)/i,
  /giv mig feedback/i,
  /hvordan gik (jeg|det)/i,
  /i (had|ran|started)\s+a\s+meeting/i,
  /give me feedback/i,
  /how did (i|that) go/i,
];

const matchesAny = (patterns: RegExp[], message: string): boolean =>
  patterns.some((pattern) => pattern.test(message));

/**
 * Classifies the CURRENT user message only (no history lookup — the caller
 * combines this with the thread's persisted `coachingContext` for
 * multi-turn stickiness, see `chat-handler.ts`).
 *
 * Meeting-prep is checked first: a message like "forbered mig til møde —
 * kunden var utilfreds sidst" should start the guided flow, not the
 * coaching flow, even though it also matches a coaching phrase.
 */
export const detectCoachingContext = (message: string): CoachingContext => {
  const trimmed = message.trim();
  if (trimmed.length === 0) return null;

  if (matchesAny(MEETING_PREP_PATTERNS, trimmed)) return "meeting-prep";
  if (matchesAny(CONVERSATION_COACHING_PATTERNS, trimmed)) return "conversation-coaching";
  return null;
};

/**
 * Naive substring match of any of the seller's known customer names inside
 * the message — powers F-03's "kunde-kontekst injiceres proaktivt" without
 * an extra AI call. Longest name first so "DSV Logistics" wins over a
 * looser partial match when multiple known names could apply.
 */
export const findMentionedCustomerName = (
  message: string,
  knownCustomerNames: string[]
): string | null => {
  const haystack = message.toLowerCase();
  const sorted = [...knownCustomerNames].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (name.trim().length === 0) continue;
    if (haystack.includes(name.trim().toLowerCase())) {
      return name;
    }
  }
  return null;
};
