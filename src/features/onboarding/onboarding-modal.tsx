"use client";

import { CreateChatAndRedirect } from "@/features/chat-page/chat-services/chat-thread-service";
import { SALES_COACH_MODULE_REGISTRY } from "@/features/sales-coach/models";
import { AI_NAME } from "@/features/theme/theme-config";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { ArrowRight, MessageSquareText, Sparkles } from "lucide-react";
import { useState } from "react";
import { completeOnboardingAction } from "./onboarding-actions";
import { onboardingStore, useOnboardingUi } from "./onboarding-store";
import {
  CURIOUS_MODULE_OPTIONS,
  DEFAULT_ONBOARDING_ANSWERS,
  deriveStarterPrompts,
  type OnboardingAnswers,
} from "./onboarding-questions";
import { starterPromptStore } from "./starter-prompt-store";

const TOTAL_STEPS = 3;

/**
 * First-login onboarding — DESIGN.md document-block anatomy (warm-sand
 * background, copper accents, Playfair Display headings, DM Mono labels),
 * 3 skippable steps (Stage 5c, SAD §18 Phase F):
 *  1. Welcome (styled placeholder — deliberately no video, per brief).
 *  2. 3 context questions.
 *  3. 2 derived starter prompts, each deep-linking into a new chat.
 *
 * Mounted once via `OnboardingController` (see (authenticated)/layout.tsx);
 * visibility is entirely driven by `onboardingStore`, so the Help panel can
 * re-open the exact same instance later.
 */
export const OnboardingModal = () => {
  const { open } = useOnboardingUi();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>(DEFAULT_ONBOARDING_ANSWERS);

  const finish = async () => {
    onboardingStore.closeOnboarding();
    setStep(0);
    setAnswers(DEFAULT_ONBOARDING_ANSWERS);
    await completeOnboardingAction();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      void finish();
      return;
    }
    onboardingStore.openOnboarding();
  };

  const starterPrompts = deriveStarterPrompts(answers);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg gap-6" aria-describedby="onboarding-step-description">
        <DialogHeader>
          <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
            Step {step + 1} of {TOTAL_STEPS}
          </p>
          <DialogTitle className="font-display text-2xl">
            {step === 0 && `Welcome to ${AI_NAME}`}
            {step === 1 && "A little about your world"}
            {step === 2 && "Ready when you are"}
          </DialogTitle>
          <DialogDescription id="onboarding-step-description">
            {step === 0 &&
              "Your AI sales-coaching workspace — meeting prep, conversation coaching and persistent customer intelligence, built on the Sales Coach methodology."}
            {step === 1 && "Three quick questions so your first prompts are relevant, not generic."}
            {step === 2 && "Two starter conversations, built from what you just told us."}
          </DialogDescription>
        </DialogHeader>

        {step === 0 && (
          <div className="rounded-md border-l-[3px] border-primary bg-ai px-6 py-5">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles size={18} aria-hidden="true" />
              <p className="font-mono text-xs uppercase tracking-[0.1em]">What {AI_NAME} does</p>
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-foreground">
              <li>Prepares you for meetings with structured, 2nd Position briefs.</li>
              <li>Coaches your conversations against the 7 Sales Coach models.</li>
              <li>Remembers your customers and stakeholders between chats.</li>
            </ul>
          </div>
        )}

        {step === 1 && (
          <OnboardingQuestionsStep answers={answers} onChange={setAnswers} />
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            {starterPrompts.map((prompt) => (
              <form key={prompt} action={CreateChatAndRedirect}>
                <button
                  type="submit"
                  onClick={() => {
                    starterPromptStore.setPending(prompt);
                    void completeOnboardingAction();
                  }}
                  className="flex w-full min-h-[44px] items-start gap-3 rounded-md border-l-[3px] border-primary bg-ai px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-primary-light"
                >
                  <MessageSquareText size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="flex-1">{prompt}</span>
                  <ArrowRight size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </form>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-[44px]"
            onClick={() => void finish()}
          >
            Skip
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                Back
              </Button>
            )}
            {step < TOTAL_STEPS - 1 ? (
              <Button
                type="button"
                size="sm"
                className="min-h-[44px]"
                onClick={() => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))}
              >
                Next
              </Button>
            ) : (
              <Button type="button" size="sm" className="min-h-[44px]" onClick={() => void finish()}>
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const OnboardingQuestionsStep = ({
  answers,
  onChange,
}: {
  answers: OnboardingAnswers;
  onChange: (answers: OnboardingAnswers) => void;
}) => (
  <div className="flex flex-col gap-4">
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
        Primary customer segment
      </span>
      <input
        type="text"
        value={answers.customerSegment}
        onChange={(e) => onChange({ ...answers, customerSegment: e.target.value })}
        placeholder="e.g. Nordic manufacturing, public sector, SaaS mid-market..."
        className="min-h-[44px] rounded-md border border-border-strong bg-background px-3 py-2 text-sm text-foreground"
      />
    </label>

    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
        Which model are you most curious about?
      </span>
      <select
        value={answers.curiousModule}
        onChange={(e) =>
          onChange({ ...answers, curiousModule: e.target.value as OnboardingAnswers["curiousModule"] })
        }
        className="min-h-[44px] rounded-md border border-border-strong bg-background px-3 py-2 text-sm text-foreground"
      >
        {CURIOUS_MODULE_OPTIONS.map((key) => (
          <option key={key} value={key}>
            {SALES_COACH_MODULE_REGISTRY[key].name}
          </option>
        ))}
      </select>
    </label>

    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
        A deal or customer you&apos;re working on right now (optional)
      </span>
      <input
        type="text"
        value={answers.activeDeal}
        onChange={(e) => onChange({ ...answers, activeDeal: e.target.value })}
        placeholder="e.g. Acme A/S, renewal with Nordkraft..."
        className="min-h-[44px] rounded-md border border-border-strong bg-background px-3 py-2 text-sm text-foreground"
      />
    </label>
  </div>
);
