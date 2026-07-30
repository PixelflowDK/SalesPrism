"use client";

import { cn } from "@/ui/lib";
import React from "react";
import { useMenuState } from "./menu-store";

// "Recents" panel (DESIGN.md §5.1 item 4) — recently-viewed chat threads,
// rendered as a secondary tonal panel alongside the primary 200px nav.
export const MenuTray = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { isMenuOpen } = useMenuState();
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col bg-sidebar border-r border-border overflow-hidden transition-all duration-700 w-80",
        isMenuOpen ? "translate-x-0" : "-translate-x-full -ml-80",
        className
      )}
      {...props}
    >
      {props.children}
    </div>
  );
});
MenuTray.displayName = "MenuTray";
