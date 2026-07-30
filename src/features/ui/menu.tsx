import * as React from "react";

import { cn } from "@/ui/lib";
import { LucideProps } from "lucide-react";
import { Button, ButtonLinkVariant, ButtonProps } from "./button";
import { TooltipProvider } from "./tooltip";

const Menu = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex h-full", className)} {...props}>
    <TooltipProvider>{props.children}</TooltipProvider>
  </div>
));
Menu.displayName = "Menu";

// DESIGN.md §5.1 / §6.1 — fixed 200px, always visible, never collapsible.
const MenuBar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <nav
    ref={ref}
    aria-label="Primary"
    className={cn(
      "bg-sidebar z-10 p-3 w-[200px] shrink-0 flex flex-col justify-between h-full items-stretch border-r border-border",
      className
    )}
    {...props}
  >
    <TooltipProvider>{props.children}</TooltipProvider>
  </nav>
));
MenuBar.displayName = "MenuBar";

type AnchorProps = ButtonProps & {
  tooltip?: string;
};

const MenuItemContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-1", className)} {...props}>
    {props.children}
  </div>
));
MenuItemContainer.displayName = "MenuItemContainer";

const MenuItem = React.forwardRef<HTMLButtonElement, AnchorProps>(
  ({ className, variant = "ghost", size, asChild = false, ...props }, ref) => {
    return (
      <Button
        title={props.tooltip}
        variant={variant}
        {...props}
        className={cn(ButtonLinkVariant, className)}
        ref={ref}
      />
    );
  }
);
MenuItem.displayName = "MenuItem";

// DESIGN.md §5.1 — sidebar nav icons are 20px.
const menuIconProps: LucideProps = {
  size: 20,
  strokeWidth: 1.6,
  "aria-hidden": true,
};

export { Menu, MenuBar, MenuItem, MenuItemContainer, menuIconProps };
