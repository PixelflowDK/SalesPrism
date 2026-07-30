"use client";

import { createContext, useContext } from "react";

/**
 * Speech (STT/TTS) availability — resolved server-side once per request
 * from `isSpeechConfigured()` (see azure-speech.ts) and threaded down
 * through `AuthenticatedProviders`, same pattern as `TenantThemeStyle` in
 * app/layout.tsx. This avoids an extra round-trip to the token route just
 * to answer "is voice input configured at all?" — the Speech resource
 * doesn't exist in every environment yet (Stage 5c brief: infra owned by a
 * separate workstream), so the mic button must know to hide/disable itself
 * WITHOUT the seller ever pressing it and hitting a 503.
 */
const SpeechAvailabilityContext = createContext<boolean>(false);

export const SpeechAvailabilityProvider = ({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) => (
  <SpeechAvailabilityContext.Provider value={enabled}>
    {children}
  </SpeechAvailabilityContext.Provider>
);

/** `true` only when `AZURE_SPEECH_REGION` + `AZURE_SPEECH_RESOURCE_ID` are both set for this tenant's App Service. */
export const useSpeechAvailability = (): boolean => useContext(SpeechAvailabilityContext);
