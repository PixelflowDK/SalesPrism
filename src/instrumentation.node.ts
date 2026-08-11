import type { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-base";

/**
 * src/instrumentation.node.ts — SR-010: the actual Node-only telemetry setup.
 *
 * Deliberately a SEPARATE file from `src/instrumentation.ts`, imported from
 * there via exactly `await import("./instrumentation.node")` inside
 * `if (process.env.NEXT_RUNTIME === "nodejs")`. That precise shape matters:
 * it is Next.js's own documented idiom for keeping Node-only instrumentation
 * code out of the Edge runtime bundle. A first version of this file's logic
 * lived directly inside `src/instrumentation.ts` with a slightly different
 * conditional (early-return on `!==`, extra statements before the dynamic
 * import) — Next's build still traced the dynamic import's full dependency
 * graph (`@azure/monitor-opentelemetry` → `@opentelemetry/sdk-node` →
 * `@grpc/grpc-js`) into the Edge/middleware bundle. Because `middleware.ts`'s
 * Edge runtime has no `require()`/Node core modules, marking that graph as a
 * webpack `commonjs` external for the Edge target (an earlier attempt at
 * fixing the *build* error) made middleware throw on every request — every
 * `requireAuth` route (`/chat`, `/admin`, `/customers`, …) started 500ing
 * instead of redirecting an unauthenticated visitor to `/`. Caught live on
 * val1 before sign-off; see docs/deployment-record.md, SR-010 section, for
 * the full incident and fix. Splitting into this file with the exact
 * documented idiom fixes both problems at once: the Edge bundle no longer
 * references this file's contents at all, so nothing needs to be externalized
 * for that target, and `next.config.js`'s webpack externals hook is scoped to
 * `nextRuntime !== "edge"` regardless, as defense in depth.
 *
 * See src/instrumentation.ts for the full PII-discipline and boot-self-test
 * rationale (SAD §31.3, safe-logger.ts parity) — unchanged, just relocated.
 */

class PiiRedactionSpanProcessor implements SpanProcessor {
  private static readonly URL_ATTRS_TO_TRUNCATE = ["http.url", "url.full", "http.target", "url.path"] as const;
  private static readonly ATTRS_TO_DROP = [
    "url.query",
    "http.request.header.cookie",
    "http.request.header.authorization",
  ] as const;

  private redact(span: ReadableSpan): void {
    const attributes = span.attributes as Record<string, unknown>;
    for (const key of PiiRedactionSpanProcessor.URL_ATTRS_TO_TRUNCATE) {
      const value = attributes[key];
      if (typeof value === "string" && value.includes("?")) {
        attributes[key] = value.split("?")[0];
      }
    }
    for (const key of PiiRedactionSpanProcessor.ATTRS_TO_DROP) {
      delete attributes[key];
    }
  }

  onStart(): void {
    // Intentionally empty — see onEnd.
  }

  onEnd(span: ReadableSpan): void {
    this.redact(span);
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

export async function registerNodeTelemetry(): Promise<void> {
  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!connectionString) {
    // Local dev / any environment without an Application Insights resource
    // wired up. Do not initialise — there is nowhere to send telemetry, and
    // failing to configure a connection string must never crash the app.
    return;
  }

  const [{ useAzureMonitor }, { trace, SpanKind, SpanStatusCode }, { resourceFromAttributes }] = await Promise.all([
    import("@azure/monitor-opentelemetry"),
    import("@opentelemetry/api"),
    import("@opentelemetry/resources"),
  ]);

  const tenantSlug = process.env.TENANT_SLUG;

  useAzureMonitor({
    azureMonitorExporterOptions: { connectionString },
    resource: resourceFromAttributes({
      "service.name": tenantSlug ? `app-azurechat-${tenantSlug}` : "sales-prism-app",
      "service.namespace": "sales-prism",
    }),
    spanProcessors: [new PiiRedactionSpanProcessor()],
    instrumentationOptions: {
      // Bridges safe-logger.ts's console.error/warn/info output into
      // AppTraces without any change to application logging code.
      console: { enabled: true },
    },
  });

  // --- Boot self-test (see src/instrumentation.ts header comment) ---------
  // Runs once per cold start. Never touches HTTP, auth, or customer data.
  const tracer = trace.getTracer("sales-prism.telemetry-selftest");
  const selfTestSpan = tracer.startSpan("telemetry.selftest.boot", { kind: SpanKind.INTERNAL });
  selfTestSpan.setAttribute("selftest", true);
  selfTestSpan.recordException(
    new Error("telemetry.selftest.synthetic-exception — expected on every boot, not a real failure")
  );
  selfTestSpan.setStatus({ code: SpanStatusCode.ERROR, message: "synthetic-exception" });
  selfTestSpan.end();

  // eslint-disable-next-line no-console -- deliberate: this IS the AppTraces
  // boundary (bridged by the `console` instrumentation enabled above), and
  // the payload is a static code string, matching safe-logger.ts's pattern.
  console.info(JSON.stringify({ code: "telemetry.selftest.boot", status: "ok" }));
}
