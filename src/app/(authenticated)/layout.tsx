import { EnsureUserOnLogin } from "@/features/admin/user-service";
import { AuthenticatedProviders } from "@/features/globals/providers";
import { MainMenu } from "@/features/main-menu/main-menu";
import { AI_NAME } from "@/features/theme/theme-config";
import { cn } from "@/ui/lib";

export const dynamic = "force-dynamic";

export const metadata = {
  title: AI_NAME,
  description: AI_NAME,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // SAD §8.4 — lazily upserts the admin user directory entry + a throttled
  // `lastLoginAt` on first authenticated request. NextAuth's own callback
  // (src/features/auth-page/auth-api.ts) is read-only for this change, so
  // this wraps every authenticated route instead (see EnsureUserOnLogin
  // doc-comment). Best-effort — never throws, so a Cosmos hiccup here can
  // never block the whole authenticated app shell from rendering.
  await EnsureUserOnLogin();

  return (
    <AuthenticatedProviders>
      <div className={cn("flex flex-1 items-stretch")}>
        <MainMenu />
        <div className="flex-1 flex">{children}</div>
      </div>
    </AuthenticatedProviders>
  );
}
