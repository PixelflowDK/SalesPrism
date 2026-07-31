import { EnsureUserOnLogin, GetOnboardingStatus } from "@/features/admin/user-service";
import { isSpeechConfigured } from "@/features/common/services/azure-speech";
import { EnsureContainerRetentionPolicies } from "@/features/common/services/cosmos-retention";
import { HelpPanel } from "@/features/help/help-panel";
import { AuthenticatedProviders } from "@/features/globals/providers";
import { MainMenu } from "@/features/main-menu/main-menu";
import { OnboardingController } from "@/features/onboarding/onboarding-controller";
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

  // SAD §32.1 retention TTLs (GDPR) — same out-of-band-container reasoning
  // as `EnsureUserOnLogin` above: Cosmos containers aren't created by this
  // repo's Bicep, so the app applies `defaultTtl` itself. Memoized
  // per-process (see cosmos-retention.ts) — after the first successful run
  // on a given App Service instance this is a no-op boolean check, not a
  // Cosmos round-trip. Best-effort — never throws.
  await EnsureContainerRetentionPolicies();

  // Stage 5c, SAD §18 Phase F — resolved once per request, right after
  // `EnsureUserOnLogin` so the caller's own directory entry is guaranteed
  // to exist by the time this runs (see `GetOnboardingStatus` doc comment).
  const onboardingStatus = await GetOnboardingStatus();

  return (
    <AuthenticatedProviders speechEnabled={isSpeechConfigured()}>
      <div className={cn("flex flex-1 items-stretch")}>
        <MainMenu />
        <div className="flex-1 flex">{children}</div>
      </div>
      <OnboardingController initiallyCompleted={onboardingStatus.completed} />
      <HelpPanel />
    </AuthenticatedProviders>
  );
}
