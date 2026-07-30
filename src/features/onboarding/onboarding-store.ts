"use client";

import { proxy, useSnapshot } from "valtio";

/**
 * Onboarding modal open/closed state (Stage 5c, SAD §18 Phase F). Deliberately
 * separate from the modal component itself so both `OnboardingController`
 * (auto-open on first login) and the Help panel's "Restart onboarding"
 * button can drive the same modal instance without prop-drilling.
 */
class OnboardingUiState {
  public open: boolean = false;

  public openOnboarding() {
    this.open = true;
  }

  public closeOnboarding() {
    this.open = false;
  }
}

export const onboardingStore = proxy(new OnboardingUiState());

export const useOnboardingUi = () => useSnapshot(onboardingStore);
