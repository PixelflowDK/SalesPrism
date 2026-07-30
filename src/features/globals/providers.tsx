"use client";
import { SessionProvider } from "next-auth/react";
import { SpeechAvailabilityProvider } from "@/features/chat-page/chat-input/speech/speech-availability-context";

export const AuthenticatedProviders = ({
  speechEnabled,
  children,
}: {
  /** Server-resolved `isSpeechConfigured()` — see azure-speech.ts. */
  speechEnabled: boolean;
  children: React.ReactNode;
}) => {
  return (
    <SessionProvider>
      <SpeechAvailabilityProvider enabled={speechEnabled}>
        {children}
      </SpeechAvailabilityProvider>
    </SessionProvider>
  );
};
