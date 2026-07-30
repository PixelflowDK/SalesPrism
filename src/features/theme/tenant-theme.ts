import "server-only";

import {
  ServerActionResponse,
  zodErrorsToServerActionErrors,
} from "@/features/common/server-action-response";
import { SqlQuerySpec } from "@azure/cosmos";
import { z } from "zod";
import { ConfigContainer } from "../common/services/cosmos";

/**
 * TenantTheme — Cosmos DB persistence + runtime shape for per-tenant
 * white-label theming and platform tiering.
 *
 * SAD v2.7 §10.3. Persisted in the existing `ConfigContainer` (see
 * src/features/common/services/cosmos.ts) alongside PromptModel /
 * PersonaModel / ExtensionModel documents, using the same `type`
 * discriminator + `/userId` partition-key convention.
 *
 * TenantTheme is a tenant-level singleton, not a per-user document — each
 * customer already gets a fully isolated, dedicated Cosmos DB instance
 * (SAD §6.1), so there is exactly one TenantTheme document per Cosmos
 * account. The `userId` partition-key field is set to the tenant slug
 * itself (`tenantSlug`) rather than an end-user id, purely so the
 * document fits the container's existing `/userId` partition key path.
 */
export const TENANT_THEME_ATTRIBUTE = "TENANT_THEME_CONFIG";

export const PlatformTierSchema = z.enum(["smb", "professional", "enterprise"]);
export type PlatformTier = z.infer<typeof PlatformTierSchema>;

export const AuthMethodSchema = z.enum(["entra-sso", "username-password"]);
export type AuthMethod = z.infer<typeof AuthMethodSchema>;

export const TenantThemeColorsSchema = z.object({
  primary: z.string(),
  background: z.string(),
  foreground: z.string(),
  fontDisplay: z.string(),
  fontBody: z.string(),
  logoUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
});
export type TenantThemeColors = z.infer<typeof TenantThemeColorsSchema>;

export const TenantThemeDarkModeSchema = z.object({
  primary: z.string(),
  background: z.string(),
  foreground: z.string(),
});
export type TenantThemeDarkMode = z.infer<typeof TenantThemeDarkModeSchema>;

export type TenantTheme = z.infer<typeof TenantThemeModelSchema>;

export const TenantThemeModelSchema = z.object({
  id: z.string(),
  type: z.literal(TENANT_THEME_ATTRIBUTE),
  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
  userId: z.string(),
  tenantSlug: z.string(),
  tier: PlatformTierSchema,
  /** Enterprise-only. SMB/Professional tenants always render the standard
   *  Sales Prism tokens (DESIGN.md §2.7) unmodified — see §8.3. */
  whiteLabel: z.boolean(),
  authMethod: AuthMethodSchema,
  theme: TenantThemeColorsSchema.nullable(),
  darkMode: TenantThemeDarkModeSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const tenantThemeDocId = (tenantSlug: string) => `tenant-theme-${tenantSlug}`;

const buildDefaultTenantTheme = (tenantSlug: string): TenantTheme => {
  const now = new Date().toISOString();
  const tier = PlatformTierSchema.safeParse(process.env.PLATFORM_TIER);

  return {
    id: tenantThemeDocId(tenantSlug),
    type: TENANT_THEME_ATTRIBUTE,
    userId: tenantSlug,
    tenantSlug,
    tier: tier.success ? tier.data : "smb",
    whiteLabel: false,
    authMethod: "username-password",
    theme: null,
    darkMode: null,
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Reads the TenantTheme document for a tenant slug. Does NOT create one —
 * see `EnsureTenantTheme` for the seed-on-first-boot flow.
 */
export const GetTenantTheme = async (
  tenantSlug: string
): Promise<ServerActionResponse<TenantTheme>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query: "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug",
      parameters: [
        { name: "@type", value: TENANT_THEME_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
      ],
    };

    const { resources } = await ConfigContainer()
      .items.query<TenantTheme>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    if (resources.length === 0) {
      return {
        status: "NOT_FOUND",
        errors: [{ message: `TenantTheme not found for slug: ${tenantSlug}` }],
      };
    }

    const parsed = TenantThemeModelSchema.safeParse(resources[0]);
    if (!parsed.success) {
      return {
        status: "ERROR",
        errors: zodErrorsToServerActionErrors(parsed.error.errors),
      };
    }

    return { status: "OK", response: parsed.data };
  } catch (error) {
    return {
      status: "ERROR",
      errors: [{ message: `Error retrieving TenantTheme: ${error}` }],
    };
  }
};

/**
 * Seed-on-first-boot: returns the tenant's TenantTheme document, creating
 * the Sales Prism standard-theme default if none exists yet.
 *
 * This replaces the workflow-side Cosmos seeding step that provisioning
 * can no longer perform once the customer's Cosmos DB sits behind a
 * private endpoint (SAD §7.1) — the GitHub Actions runner has no network
 * path to it, so the running app seeds its own config on first request.
 */
export const EnsureTenantTheme = async (
  tenantSlug: string
): Promise<ServerActionResponse<TenantTheme>> => {
  const existing = await GetTenantTheme(tenantSlug);

  if (existing.status === "OK") {
    return existing;
  }

  if (existing.status !== "NOT_FOUND") {
    return existing;
  }

  const seeded = buildDefaultTenantTheme(tenantSlug);

  try {
    const { resource } = await ConfigContainer().items.create<TenantTheme>(seeded);

    if (resource) {
      return { status: "OK", response: resource };
    }

    return {
      status: "ERROR",
      errors: [{ message: `Failed to seed TenantTheme for slug: ${tenantSlug}` }],
    };
  } catch (error) {
    // Cosmos raises a 409 Conflict if a concurrent request already
    // created the same deterministic id first — that's not an error,
    // it just means we lost the seed race. Read back what won.
    const status = (error as { code?: number })?.code;
    if (status === 409) {
      return await GetTenantTheme(tenantSlug);
    }

    return {
      status: "ERROR",
      errors: [{ message: `Error seeding TenantTheme: ${error}` }],
    };
  }
};
