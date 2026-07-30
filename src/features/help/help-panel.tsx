"use client";

import { onboardingStore } from "@/features/onboarding/onboarding-store";
import { ALL_MODULE_KEYS, SALES_COACH_MODULE_REGISTRY } from "@/features/sales-coach/models";
import { AI_NAME } from "@/features/theme/theme-config";
import { Button } from "@/ui/button";
import { ScrollArea } from "@/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { helpStore, useHelpUi, type HelpTab } from "./help-store";

/**
 * Persistent Help slide-over (Stage 5c, SAD §18 Phase F) — reachable from
 * the sidebar (`main-menu.tsx`'s Help button), Esc-to-close + focus trap
 * come from the underlying Radix Dialog primitive (`Sheet`, see
 * features/ui/sheet.tsx) at no extra cost. Mounted once in
 * `(authenticated)/layout.tsx`, driven entirely by `helpStore` so any
 * component (e.g. a future inline "?" affordance) can open a specific tab.
 */
export const HelpPanel = () => {
  const { open, tab } = useHelpUi();

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? helpStore.openHelp(tab) : helpStore.closeHelp())}>
      <SheetContent className="flex w-full min-w-[420px] max-w-lg flex-col sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle className="font-display text-xl">Help</SheetTitle>
          <SheetDescription>Getting started with {AI_NAME}, the 7 Sales Coach models, and support.</SheetDescription>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => helpStore.setTab(value as HelpTab)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="getting-started" className="min-h-[44px]">
              Start
            </TabsTrigger>
            <TabsTrigger value="models" className="min-h-[44px]">
              7 models
            </TabsTrigger>
            <TabsTrigger value="faq" className="min-h-[44px]">
              FAQ
            </TabsTrigger>
            <TabsTrigger value="support" className="min-h-[44px]">
              Support
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 -mx-6 mt-2">
            <div className="px-6 pb-6">
              <TabsContent value="getting-started" className="flex flex-col gap-4">
                <div className="rounded-md border-l-[3px] border-primary bg-ai px-5 py-4 text-sm text-foreground">
                  <p className="font-body font-semibold">Meeting prep</p>
                  <p className="mt-1 text-muted-foreground">
                    Mention a customer and ask for a meeting brief — {AI_NAME} builds opening questions,
                    value-area themes and discovery questions by persona.
                  </p>
                </div>
                <div className="rounded-md border-l-[3px] border-primary bg-ai px-5 py-4 text-sm text-foreground">
                  <p className="font-body font-semibold">Customer intelligence</p>
                  <p className="mt-1 text-muted-foreground">
                    What you tell {AI_NAME} about a customer is remembered under Customers, so you don&apos;t
                    have to repeat context in every chat.
                  </p>
                </div>
                <div className="rounded-md border-l-[3px] border-primary bg-ai px-5 py-4 text-sm text-foreground">
                  <p className="font-body font-semibold">Voice input</p>
                  <p className="mt-1 text-muted-foreground">
                    Hold the microphone button to dictate — it&apos;s cleaned up and lightly categorised
                    before it lands in the input, always editable before you send.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => {
                    helpStore.closeHelp();
                    onboardingStore.openOnboarding();
                  }}
                >
                  Restart the welcome tour
                </Button>
              </TabsContent>

              <TabsContent value="models" className="flex flex-col gap-3">
                {ALL_MODULE_KEYS.map((key) => {
                  const model = SALES_COACH_MODULE_REGISTRY[key];
                  return (
                    <div key={key} className="rounded-md border-l-[3px] border-primary bg-ai px-5 py-4">
                      <p className="font-mono text-xs uppercase tracking-[0.1em] text-primary-text">{key}</p>
                      <p className="mt-1 font-body font-semibold text-foreground">{model.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{model.essence}</p>
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="faq" className="flex flex-col gap-4 text-sm">
                <FaqItem
                  question="Is my customer data shared with other tenants?"
                  answer={`No — each customer of ${AI_NAME} runs on a fully isolated Azure stack, and your data never leaves the EU.`}
                />
                <FaqItem
                  question="What languages does voice input support?"
                  answer="Danish, Norwegian, Swedish, English and German — the recognizer auto-detects which one you're speaking."
                />
                <FaqItem
                  question="Can I reopen a meeting brief later?"
                  answer="Yes — every saved brief is available under Briefs and reopens exactly as it was generated."
                />
                <FaqItem
                  question="Why is the microphone button greyed out?"
                  answer="Voice input isn't set up for your workspace yet — ask your admin, or keep typing in the meantime."
                />
              </TabsContent>

              <TabsContent value="support" className="flex flex-col gap-4 text-sm text-foreground">
                <p>
                  For account, billing or access questions, contact your workspace administrator — they
                  manage users and settings under Admin.
                </p>
                <p className="text-muted-foreground">
                  For a product bug or something that looks wrong, include the reference code shown with
                  any error message — it helps us find the exact request.
                </p>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};

const FaqItem = ({ question, answer }: { question: string; answer: string }) => (
  <div>
    <p className="font-body font-semibold text-foreground">{question}</p>
    <p className="mt-1 text-muted-foreground">{answer}</p>
  </div>
);
