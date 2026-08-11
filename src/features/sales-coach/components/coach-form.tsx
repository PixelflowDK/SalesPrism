"use client";

import { useSpeechAvailability } from "@/features/chat-page/chat-input/speech/speech-availability-context";
import { CreateChatAndRedirect } from "@/features/chat-page/chat-services/chat-thread-service";
import { starterPromptStore } from "@/features/onboarding/starter-prompt-store";
import { Button } from "@/features/ui/button";
import { Microphone } from "@/features/ui/chat/chat-input-area/microphone";
import { Label } from "@/features/ui/label";
import { Textarea } from "@/features/ui/textarea";
import { useState } from "react";

/**
 * W3 (`/coach`) — F-02 entry-point form. Same hand-off pattern as
 * `prepare-form.tsx`: the synthesized starter message contains one of
 * `intent-detection.ts`'s conversation-coaching trigger phrases ("I had a
 * meeting...") so the existing, tested keyword classifier reliably routes
 * the new thread into the 1st/2nd Position coaching guidance — reused
 * unmodified.
 *
 * Mic control (F-02 acceptance): reuses the exact `<Microphone>` component
 * the main chat input uses, including its own built-in
 * "gracefully disabled with a tooltip when unavailable" behavior (see
 * microphone.tsx) — `useSpeechAvailability()` is `false` in every
 * environment today (no Speech resource provisioned yet, val1 included), so
 * this renders disabled-with-tooltip out of the box. Real
 * press-and-hold-to-dictate wiring into this page's local textarea (as
 * opposed to the global chat input) is deferred until Speech infra exists —
 * documented, not silently stubbed: the handlers below are inert no-ops
 * that the disabled state never invokes.
 */
export const CoachForm = () => {
  const [narrative, setNarrative] = useState("");
  const speechAvailable = useSpeechAvailability();
  const canSubmit = narrative.trim().length > 0;

  return (
    <form action={CreateChatAndRedirect} className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="coach-narrative">What happened in this meeting?</Label>
          <Microphone
            isAvailable={speechAvailable}
            isMicrophoneReady={false}
            isTranscribing={false}
            isPlaying={false}
            stopPlaying={() => {}}
            startRecognition={() => {}}
            stopRecognition={() => {}}
          />
        </div>
        <Textarea
          id="coach-narrative"
          name="narrative"
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          rows={8}
          placeholder="Paste or describe the conversation — what you said, how the customer reacted, what came up..."
          required
        />
        <p className="text-xs text-muted-foreground">
          {speechAvailable
            ? "Press and hold the microphone to dictate instead of typing."
            : "Voice input isn't set up for this workspace yet — type or paste instead."}
        </p>
      </div>

      <div>
        <Button
          type="submit"
          className="min-h-[44px]"
          disabled={!canSubmit}
          onClick={() => {
            if (!canSubmit) return;
            starterPromptStore.setPending(`I had a meeting. Here's what happened: ${narrative.trim()}`);
          }}
        >
          Get coaching feedback
        </Button>
      </div>
    </form>
  );
};
