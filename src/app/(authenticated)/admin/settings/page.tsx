import { requireAdminContext } from "@/features/admin/admin-guard";
import { DisplayError } from "@/features/ui/error/display-error";
import { Textarea } from "@/features/ui/textarea";
import { EnsureTenantTheme } from "@/features/theme/tenant-theme";

const AUTH_METHOD_LABEL: Record<string, string> = {
  "entra-sso": "Entra ID SSO",
  "username-password": "Username / password (Entra External ID CIAM)",
};

export default async function AdminSettingsPage() {
  const { tenantSlug } = await requireAdminContext();
  const themeResponse = await EnsureTenantTheme(tenantSlug);

  if (themeResponse.status !== "OK") {
    return <DisplayError errors={themeResponse.errors} />;
  }

  const theme = themeResponse.response;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="rounded-md border border-border bg-card p-6">
        <h2 className="font-display text-lg font-bold text-foreground">
          Tenant configuration
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Tenant slug</dt>
          <dd className="font-mono">{theme.tenantSlug}</dd>

          <dt className="text-muted-foreground">Platform tier</dt>
          <dd className="font-mono capitalize">{theme.tier}</dd>

          <dt className="text-muted-foreground">White-label</dt>
          <dd className="font-mono">{theme.whiteLabel ? "Enabled" : "Disabled"}</dd>

          <dt className="text-muted-foreground">Auth method</dt>
          <dd>
            {AUTH_METHOD_LABEL[theme.authMethod] ?? theme.authMethod}
            <p className="mt-1 text-xs text-muted-foreground">
              Display-only. Entra External ID Graph API management is not wired
              up yet — the shared CIAM tenant does not exist (SAD §8.3). Changing
              this value requires operator action during onboarding.
            </p>
          </dd>

          <dt className="text-muted-foreground">Usage analytics</dt>
          <dd className="font-mono">
            {theme.features.userAnalytics ? "Enabled" : "Disabled"}
          </dd>
        </dl>
      </section>

      <section className="rounded-md border-l-[3px] border-tertiary bg-tertiary-light p-6">
        <h2 className="font-display text-lg font-bold text-foreground">
          Persona
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Persona editing (assistant name, tone, methodology modules, rules —
          SAD §30.3) is Phase E. This is a placeholder preview only; it is not
          wired to any save action yet.
        </p>
        <Textarea
          className="mt-4"
          rows={6}
          disabled
          placeholder="Persona / system-prompt editor — coming in Phase E"
        />
      </section>
    </div>
  );
}
