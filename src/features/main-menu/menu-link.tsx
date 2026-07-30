"use client";
import { cn } from "@/ui/lib";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FC } from "react";
import { ButtonLinkVariant } from "../ui/button";

interface MenuLinkProps {
  href: string;
  ariaLabel: string;
  children: React.ReactNode;
}

// DESIGN.md §5.1 — active nav item: 3px primary left border + primary-light
// background tint, icon/label in primary. Inactive: secondary text, hover
// gets the standard --color-bg-hover tint.
export const MenuLink: FC<MenuLinkProps> = (props) => {
  const path = usePathname();
  const isActive = path.startsWith(props.href) && props.href !== "/";

  return (
    <Link
      className={cn(
        ButtonLinkVariant,
        "border-l-[3px]",
        isActive
          ? "border-primary bg-primary-light text-primary-text font-medium"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      href={props.href}
      aria-label={props.ariaLabel}
      aria-current={isActive ? "page" : undefined}
    >
      {props.children}
    </Link>
  );
};
