import { getCurrentUser } from "@/features/auth-page/helpers";
import { AdminNav } from "@/features/admin/components/admin-nav";
import { AI_NAME } from "@/features/theme/theme-config";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Admin — ${AI_NAME}`,
  description: `Customer-admin portal for ${AI_NAME}`,
};

/**
 * Server-side admin-role guard (SAD §8.5). `src/middleware.ts` already
 * blocks non-admin sessions from reaching `/admin/*` at the edge — this is
 * defense in depth, re-checking the same `isAdmin` claim from
 * `getCurrentUser()` (auth-page helpers, read-only for this change) inside
 * the render path itself so a forgotten/misconfigured middleware matcher
 * can never expose this section.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user.isAdmin) {
    redirect("/unauthorized");
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="px-8 pb-4 pt-8">
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
          Admin
        </p>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Customer administration
        </h1>
      </header>
      <AdminNav />
      <div className="flex-1 px-8 py-6">{children}</div>
    </div>
  );
}
