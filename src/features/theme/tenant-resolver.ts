/**
 * Tenant resolution — derives the customer slug from the inbound `Host`
 * header. Pure, synchronous, unit-testable: no Cosmos/Azure calls here.
 *
 * SAD v2.7 §5.3 / Stage 4 brief: production tenants are addressed as
 * `{slug}-sales360.pixelflow.dk`. Anything that doesn't match that pattern
 * (localhost, `*.azurewebsites.net` staging slots, or an unrecognized
 * host) resolves to the `TENANT_SLUG` env var (default `val1`) — this
 * covers local dev and the App Service default hostname before a
 * customer's Cloudflare DNS record is cut over.
 *
 * NOTE: this pattern differs from the `{slug}.sales-prism.com` production
 * domain described in SAD §12.1. Confirm with Kristjan whether
 * `pixelflow.dk` is an interim/staging domain or supersedes the SAD
 * pattern before this ships to a customer-facing environment.
 */

const TENANT_SUBDOMAIN_PATTERN = /^([a-z][a-z0-9-]{1,19})-sales360\.pixelflow\.dk$/;

const DEFAULT_TENANT_SLUG = "val1";

/**
 * Strips port and casing from a raw `Host` header value.
 * `dsv-sales360.pixelflow.dk:3000` -> `dsv-sales360.pixelflow.dk`
 */
export const normalizeHost = (hostHeader: string | null | undefined): string => {
  if (!hostHeader) return "";
  return hostHeader.split(":")[0].trim().toLowerCase();
};

/**
 * Returns the platform-default tenant slug for non-production hosts
 * (local dev, `*.azurewebsites.net` staging slots).
 */
export const getDefaultTenantSlug = (): string => {
  const configured = process.env.TENANT_SLUG?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_TENANT_SLUG;
};

/**
 * Resolves the tenant slug for the current request from its `Host` header.
 *
 * - `dsv-sales360.pixelflow.dk` -> `"dsv"`
 * - `localhost:3000`, `app-azurechat-val1.azurewebsites.net`, or any
 *   other unrecognized host -> `getDefaultTenantSlug()`
 */
export const resolveTenantSlug = (hostHeader: string | null | undefined): string => {
  const hostname = normalizeHost(hostHeader);
  const match = hostname.match(TENANT_SUBDOMAIN_PATTERN);
  if (match) {
    return match[1];
  }
  return getDefaultTenantSlug();
};

export { TENANT_SUBDOMAIN_PATTERN };
