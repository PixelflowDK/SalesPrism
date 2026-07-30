import "server-only";

/**
 * safe-logger — Codex review #1 finding 7 (MEDIUM) remediation.
 *
 * The chat handler previously did `console.error("...", error)` /
 * `console.error("...", errors)` with raw SDK error objects and
 * ServerActionError arrays. This app is prewired to Application Insights
 * (infra/modules/observability.bicep), so anything written to
 * console.error/warn/info in production is customer telemetry — and those
 * raw objects routinely carry prompt text, document filenames, AI Search
 * OData filters, and sometimes retrieved chunk content. That is PII/customer
 * data leaking into logs with no minimization.
 *
 * `safeLog` is the only logging entry point this app should use for
 * anything touching a chat request, a document, or a tenant lookup. It
 * accepts nothing but a stable event code plus an explicit allow-list of
 * "known-safe" fields — there is no parameter for a raw `Error`, `unknown`,
 * or free-form message string, so a caller physically cannot pass prompt
 * text or file content through it by accident.
 *
 * If you need a new field, add it to `SafeLogFields` deliberately and
 * confirm it can never contain user-authored content (prompts, filenames,
 * document text, search filters, emails, display names) before doing so.
 */

export type SafeLogFields = Partial<{
  /** Correlation id for this request — see `newRequestId()`. Never a user id or session token. */
  requestId: string;
  /** Tenant slug (SAD §5.3) — not customer-identifying beyond what's already in the hostname. */
  tenantSlug: string;
  /** Cosmos chat-thread id (opaque nanoid) — not user-authored content. */
  chatThreadId: string;
  /** SHA-256 hash of the user's email (see `userHashedId()`) — never the raw email/name. */
  userId: string;
  /** HTTP-ish status code, e.g. 401 / 404 / 500. */
  statusCode: number;
  /** A plain count (documents found, users listed, rows exported, etc). */
  count: number;
  /** Elapsed time in milliseconds. */
  durationMs: number;
  /** Activity/event type discriminator, e.g. "prompt" | "login" | "upload". */
  eventType: string;
  /** A stable, developer-defined error code — never an interpolated Error/exception message. */
  errorCode: string;
}>;

const SAFE_FIELD_KEYS: Array<keyof SafeLogFields> = [
  "requestId",
  "tenantSlug",
  "chatThreadId",
  "userId",
  "statusCode",
  "count",
  "durationMs",
  "eventType",
  "errorCode",
];

const sanitizeFields = (fields?: SafeLogFields): Record<string, unknown> => {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const key of SAFE_FIELD_KEYS) {
    const value = fields[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
};

const emit = (
  level: "error" | "warn" | "info",
  code: string,
  fields?: SafeLogFields
): void => {
  const payload = { code, ...sanitizeFields(fields) };
  // eslint-disable-next-line no-console -- this IS the logging boundary; every
  // other call site in the app should go through safeLog instead of console.*.
  console[level](JSON.stringify(payload));
};

export const safeLog = {
  error: (code: string, fields?: SafeLogFields): void => emit("error", code, fields),
  warn: (code: string, fields?: SafeLogFields): void => emit("warn", code, fields),
  info: (code: string, fields?: SafeLogFields): void => emit("info", code, fields),
};

/**
 * Lightweight, dependency-free correlation id for tying a user-facing error
 * message ("Something went wrong — reference req_xxx") back to the
 * corresponding `safeLog` line, without ever needing to log the underlying
 * error content itself.
 */
export const newRequestId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `req_${globalThis.crypto.randomUUID()}`;
  }
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
};
