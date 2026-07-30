"use client";

import { useEffect } from "react";
import { OnboardingModal } from "./onboarding-modal";
import { onboardingStore } from "./onboarding-store";

/**
 * Mounted once in `(authenticated)/layout.tsx`. Auto-opens the onboarding
 * modal on first render for a user who hasn't completed/skipped it yet
 * (server-resolved `initiallyCompleted`, see `GetOnboardingStatus` in
 * user-service.ts) — a `useEffect` rather than deriving `open` directly
 * from the prop so the Help panel's "Restart onboarding" button (which
 * flips `onboardingStore.open` later in the session) isn't fought by this
 * component re-running on every re-render.
 */
export const OnboardingController = ({
  initiallyCompleted,
}: {
  initiallyCompleted: boolean;
}) => {
  useEffect(() => {
    if (!initiallyCompleted) {
      onboardingStore.openOnboarding();
    }
    // Intentionally runs once on mount only — see doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <OnboardingModal />;
};
