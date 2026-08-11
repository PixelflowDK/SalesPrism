import { AzureKeyVaultInstance } from "@/features/common/services/key-vault";
import { safeLog } from "@/features/common/services/safe-logger";

/**
 * src/instrumentation-auth-secrets.node.ts — SR-001/SD-004 outage fix.
 *
 * `infra/modules/app-service.bicep` wires `AZURE_AD_CLIENT_SECRET` and
 * `NEXTAUTH_SECRET` as `@Microsoft.KeyVault(SecretUri=...)` references.
 * That mechanism is resolved by the App Service PLATFORM CONTROL PLANE,
 * which does not traverse the app's VNet integration — a
 * `publicNetworkAccess: Disabled`, private-endpoint-only vault
 * (`kv-azurechat-{slug}`, per CLAUDE.md's Private-Endpoints-for-everything
 * rule) is therefore unreachable that way, regardless of managed-identity
 * RBAC or `WEBSITE_VNET_ROUTE_ALL`. Confirmed live on val1 (see
 * docs/security-decision-log.md SD-004): both references reported
 * unresolved, and `auth-api.ts`'s `configureIdentityProvider()` guard
 * (`if (process.env.AZURE_AD_CLIENT_SECRET && ...)`) then saw an
 * absent/unusable value, so the Azure AD provider was never registered and
 * `/api/auth/providers` returned `{}` — nobody could sign in.
 *
 * The fix: fetch both secrets IN-APP via `DefaultAzureCredential`
 * (`AzureKeyVaultInstance()`, `src/features/common/services/key-vault.ts`),
 * exactly the mechanism `cosmos.ts` / `ai-search.ts` / `azure-storage.ts`
 * already use to reach their own private-endpoint-only services — that
 * traffic goes over the app's own VNet integration, not the control plane,
 * so it reaches the vault. This is strictly better than a Key Vault
 * reference, not merely a workaround: no secret value is ever written to
 * an App Service setting at all.
 *
 * Ordering: this module is dynamically imported and awaited from
 * `register()` in src/instrumentation.ts, under the exact same
 * `NEXT_RUNTIME === "nodejs"` idiom already established for SR-010
 * telemetry (src/instrumentation.node.ts) — required so the
 * `@azure/keyvault-secrets` / `@azure/identity` dependency graph is
 * excluded from the Edge (middleware) bundle via Next's build-time DCE on
 * that exact conditional shape, not merely a runtime guard.
 *
 * Deliberately run UNCONDITIONALLY here (not folded into
 * `registerNodeTelemetry()`), because that function early-returns when
 * `APPLICATIONINSIGHTS_CONNECTION_STRING` is unset — auth must never be
 * coupled to whether Application Insights happens to be configured.
 *
 * Traced through the installed `next@15.5.22` server implementation to
 * confirm this actually guarantees ordering ahead of `auth-api.ts`'s
 * module-load-time `process.env` read (`export const options = {
 * providers: [...configureIdentityProvider()] }` — evaluated the moment
 * the compiled route module is first `require()`d, not lazily per
 * request):
 *
 *   - `base-server.js#handleRequest` — `await this.prepare();` is the
 *     FIRST line of every request, with no exception for the first
 *     request ever served.
 *   - `base-server.js#prepare()` memoizes a single `preparedPromise` via
 *     `this.prepareImpl()`.
 *   - `next-server.js#prepareImpl()` — `await this.runInstrumentationHookIfAvailable()`,
 *     which awaits `ensureInstrumentationRegistered()` →
 *     `registerInstrumentation()` → `await instrumentation.register()`
 *     (`instrumentation-globals.external.js`). `preparedPromise` cannot
 *     resolve until `register()`'s returned promise resolves.
 *   - The one place a route module gets `require()`d before an explicit
 *     request even exists — `next-server.js#unstable_preloadEntries()`
 *     (`experimental.preloadEntriesOnStart`, on in this build) — itself
 *     does `await this.prepare();` as its OWN first line, before calling
 *     `loadComponents()` for any page/route.
 *
 * So every path that can load `auth-api.ts` (preload-on-start or first
 * request) is gated behind the same memoized `prepare()` promise that
 * `register()` must finish first. A module-load-time env read in
 * `auth-api.ts` is therefore safe as-is, PROVIDED (as implemented here)
 * this function is fully `await`-ed inside `register()` before that
 * function returns — a fire-and-forget call would defeat the guarantee.
 * `auth-api.ts` itself is intentionally left unmodified.
 */

const UNRESOLVED_KEYVAULT_REFERENCE_PREFIX = "@Microsoft.KeyVault(";

/** Treats an empty value AND a still-unresolved `@Microsoft.KeyVault(...)`
 * reference string (the literal, unusable text App Service may leave in
 * the process env when its control-plane resolution fails — see SD-004)
 * as equally absent. */
const isRealSecretValue = (value: string | undefined): value is string =>
  !!value && value.length > 0 && !value.startsWith(UNRESOLVED_KEYVAULT_REFERENCE_PREFIX);

type AuthSecret = {
  envVar: "AZURE_AD_CLIENT_SECRET" | "NEXTAUTH_SECRET";
  secretName: "azure-ad-client-secret" | "nextauth-secret";
};

const AUTH_SECRETS: readonly AuthSecret[] = [
  { envVar: "AZURE_AD_CLIENT_SECRET", secretName: "azure-ad-client-secret" },
  { envVar: "NEXTAUTH_SECRET", secretName: "nextauth-secret" },
];

/** A stable, non-sensitive error CODE only — never the error message/stack,
 * which can carry a Key Vault URI or other operational detail. Matches
 * safe-logger.ts's "codes only" discipline. */
const errorCodeOf = (err: unknown): string => {
  if (err && typeof err === "object") {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
    const statusCode = (err as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number") return `http-${statusCode}`;
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) return name;
  }
  return "unknown-error";
};

export async function resolveAuthSecretsFromKeyVault(): Promise<void> {
  if (!process.env.AZURE_KEY_VAULT_NAME) {
    // Local dev / any environment without a customer Key Vault wired up
    // (AzureKeyVaultInstance() would throw on this itself — short-circuit
    // with the same "never crash app boot" discipline as
    // registerNodeTelemetry()'s missing-connection-string guard).
    return;
  }

  for (const { envVar, secretName } of AUTH_SECRETS) {
    if (isRealSecretValue(process.env[envVar])) {
      // Already a real value (local .env, or a future working Key Vault
      // reference) — never overwrite a value that's already usable.
      continue;
    }

    try {
      const vault = AzureKeyVaultInstance();
      const secret = await vault.getSecret(secretName);
      if (isRealSecretValue(secret.value)) {
        process.env[envVar] = secret.value;
      } else {
        // Fetch "succeeded" but returned nothing usable — fail loudly, the
        // same as a thrown error, never silently leave the provider
        // unconfigured without a trace.
        safeLog.error("auth.keyvault.fetch-failed", {
          secretName,
          errorCode: "empty-secret-value",
        });
      }
    } catch (err) {
      safeLog.error("auth.keyvault.fetch-failed", {
        secretName,
        errorCode: errorCodeOf(err),
      });
    }
  }
}
