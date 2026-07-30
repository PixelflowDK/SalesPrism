"use server";
import "server-only";

import { MarkOnboardingCompleted } from "@/features/admin/user-service";

/**
 * Server action for the onboarding modal's "Skip" / "Finish" buttons (Stage
 * 5c, SAD §18 Phase F). Deliberately has no return value and never throws —
 * see `MarkOnboardingCompleted`'s own doc comment: a persistence failure
 * here must never block the user from dismissing the modal client-side.
 */
export const completeOnboardingAction = async (): Promise<void> => {
  await MarkOnboardingCompleted();
};
