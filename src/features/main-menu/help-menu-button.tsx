"use client";

import { helpStore } from "@/features/help/help-store";
import { menuIconProps } from "@/ui/menu";
import { HelpCircle } from "lucide-react";

/**
 * Sidebar entry point for the Help slide-over (Stage 5c, SAD §18 Phase F).
 * Rendered via `<MenuItem asChild><HelpMenuButton /></MenuItem>` (see
 * main-menu.tsx) — `asChild` lets Radix `Slot` merge `MenuItem`'s button
 * styling directly onto this element instead of nesting two `<button>`s.
 */
export const HelpMenuButton = () => (
  <button
    type="button"
    aria-label="Open Help"
    onClick={() => helpStore.openHelp("getting-started")}
  >
    <HelpCircle {...menuIconProps} />
    <span className="text-sm">Help</span>
  </button>
);
