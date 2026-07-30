"use client";

import { proxy } from "valtio";

/**
 * Carries a single "starter prompt" string from the onboarding modal's
 * step-3 cards across the `CreateChatAndRedirect` navigation into the newly
 * created chat thread's input field (Stage 5c, SAD §18 Phase F "2 derived
 * starter prompts deep-linking into a new chat").
 *
 * Deliberately an in-memory valtio store, NOT localStorage/sessionStorage —
 * CLAUDE.md "No localStorage for sensitive data" plus there is simply no
 * need for cross-tab/reload persistence here: `CreateChatAndRedirect` is a
 * same-tab Next.js App Router transition (server action + `redirect()`),
 * which preserves the client JS module/store state exactly like a
 * client-side `<Link>` navigation would.
 */
class StarterPromptState {
  public pending: string | null = null;

  public setPending(text: string) {
    this.pending = text;
  }

  /** Reads and clears the pending prompt in one step — consumed at most once. */
  public consume(): string | null {
    const value = this.pending;
    this.pending = null;
    return value;
  }
}

export const starterPromptStore = proxy(new StarterPromptState());
