"use client";

import { Button } from "@/features/ui/button";
import { FC } from "react";

// DESIGN.md §5.8 — error state: same document-block anatomy as the AI
// Response Block, but with an error-colored left border, a plain-language
// message, and a "Try again" action. Never shows raw error codes/stack
// traces to end users — callers are expected to pass user-facing copy.
export const DisplayError: FC<{ errors: Array<{ message: string }> }> = (
  props
) => {
  return (
    <div className="container max-w-4xl py-8">
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-md border-l-[3px] border-destructive bg-card px-6 py-5"
      >
        {props.errors.map((err, index) => (
          <p key={index} className="text-sm text-foreground">
            {err.message}
          </p>
        ))}
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
};
