"use client";

import { cn } from "@/ui/lib";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/groups", label: "Groups" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/settings", label: "Settings" },
] as const;

// DESIGN.md §5.2 — top-bar tab-group treatment (Context / Timeline /
// Insights): active tab gets primary-color text + 2px bottom border,
// inactive tabs stay muted with no border.
export const AdminNav = () => {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="flex gap-6 border-b border-border px-8">
      {TABS.map((tab) => {
        const active = pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex min-h-[44px] items-center border-b-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-primary-text"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
};
