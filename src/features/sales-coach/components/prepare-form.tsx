"use client";

import { CreateChatAndRedirect } from "@/features/chat-page/chat-services/chat-thread-service";
import { starterPromptStore } from "@/features/onboarding/starter-prompt-store";
import { Button } from "@/features/ui/button";
import { Input } from "@/features/ui/input";
import { Label } from "@/features/ui/label";
import { useId, useState } from "react";

/**
 * W2 (`/prepare`) — F-01 entry-point form. Deliberately does NOT rebuild the
 * guided 360° Q&A flow: it only collects the two inputs the guided flow
 * needs to start (customer + topic), then hands off into a brand-new chat
 * thread via `CreateChatAndRedirect` + `starterPromptStore` — the exact
 * same deep-link mechanism the onboarding modal already uses (see
 * onboarding-modal.tsx). The synthesized starter message deliberately
 * contains one of `intent-detection.ts`'s meeting-prep trigger phrases
 * ("prepare me for a meeting with X about Y") so the existing, tested
 * keyword classifier reliably routes the new thread into the guided
 * 360°-question flow + `meetingPrep` tool + `<MeetingBrief>` rendering —
 * all of which are reused unmodified.
 */
export const PrepareForm = ({ existingCustomerNames }: { existingCustomerNames: string[] }) => {
  const [customerName, setCustomerName] = useState("");
  const [topic, setTopic] = useState("");
  const datalistId = useId();

  const canSubmit = customerName.trim().length > 0 && topic.trim().length > 0;

  return (
    <form
      action={CreateChatAndRedirect}
      className="flex flex-col gap-4 rounded-md border border-border bg-card p-6"
      aria-describedby="prepare-form-hint"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="prepare-customer">Customer</Label>
        <Input
          id="prepare-customer"
          name="customerName"
          list={datalistId}
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="e.g. DSV Logistics"
          className="min-h-[44px]"
          required
          autoComplete="off"
        />
        <datalist id={datalistId}>
          {existingCustomerNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <p className="text-xs text-muted-foreground">
          Pick an existing customer or type a new name — Coach 360 creates their profile automatically.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="prepare-topic">Meeting topic</Label>
        <Input
          id="prepare-topic"
          name="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. NIS2 compliance renewal"
          className="min-h-[44px]"
          required
        />
      </div>

      <p id="prepare-form-hint" className="text-sm text-muted-foreground">
        Coach 360 will ask you 4 guided 360° questions, then generate a structured meeting brief you can save and
        reopen from Briefs.
      </p>

      <div>
        <Button
          type="submit"
          className="min-h-[44px]"
          disabled={!canSubmit}
          onClick={() => {
            if (!canSubmit) return;
            starterPromptStore.setPending(
              `Prepare me for a meeting with ${customerName.trim()} about ${topic.trim()}.`
            );
          }}
        >
          Start guided preparation
        </Button>
      </div>
    </form>
  );
};
