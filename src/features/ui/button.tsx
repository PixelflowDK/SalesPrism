import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "./lib";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // DESIGN.md §5.5 — primary/secondary hover states use the explicit
        // --color-*-hover tokens rather than a Tailwind opacity modifier
        // (Tailwind 3.3's alpha-channel extraction doesn't apply to plain
        // `var(--x)` color values, so `/90`-style modifiers on these would
        // silently no-op).
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-border-strong bg-transparent text-foreground hover:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary-hover",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        // DESIGN.md §7.1 — minimum 44x44px touch target on every
        // interactive control, regardless of the visual icon size.
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

// Sidebar nav row (DESIGN.md §5.1) — full-width, left-aligned icon+label,
// min 44px touch target. Active/inactive color treatment is applied by
// the caller (see MenuLink) since it depends on route matching.
const ButtonLinkVariant = cn(
  buttonVariants({ variant: "ghost" }),
  "w-full min-h-[44px] px-3 py-2 flex items-center justify-start gap-3 text-left rounded-md whitespace-normal"
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, ButtonLinkVariant, buttonVariants };
