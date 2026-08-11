/**
 * src/instrumentation.ts — SR-010 remediation: real server-side telemetry.
 *
 * Wires the Azure Monitor OpenTelemetry Distro into Next.js 15's stable
 * `instrumentation.ts` hook (`register()`), which the framework calls exactly
 * once per server process, before any request is handled — the idiomatic
 * Next.js integration point for Node-only server telemetry.
 *
 * Before this file existed, `APPLICATIONINSIGHTS_CONNECTION_STRING` was set
 * as an App Service setting (infra/modules/app-service.bicep) but nothing in
 * the app ever initialised an SDK against it — `law-azurechat-{slug}`
 * received zero telemetry and the SAD §31.2 alert rules had no data to
 * evaluate.
 *
 * This wrapper is deliberately minimal and matches Next.js's own documented
 * idiom exactly: `if (process.env.NEXT_RUNTIME === "nodejs") { await
 * import(...) }`, with nothing else in the conditional block. Next.js invokes
 * `register()` in BOTH the Node.js and Edge runtimes (middleware.ts compiles
 * through the Edge runtime); this precise shape is what keeps the Node-only
 * telemetry SDK (and its `@grpc/grpc-js` / Node-core-module dependency graph)
 * out of the Edge bundle. All the actual setup lives in
 * `src/instrumentation.node.ts` — see that file for the full PII-discipline
 * rationale (SAD §31.3), the boot self-test, and the incident this exact
 * two-file split fixes (an earlier single-file version broke every
 * authenticated route on val1 — docs/deployment-record.md, SR-010 section).
 *
 * SR-001/SD-004 — this hook is also where `AZURE_AD_CLIENT_SECRET` /
 * `NEXTAUTH_SECRET` get populated from Key Vault via
 * `resolveAuthSecretsFromKeyVault()` (src/instrumentation-auth-secrets.node.ts —
 * see that file for the full outage/root-cause writeup and the proof that
 * awaiting it here, before `register()` returns, is what guarantees it
 * completes before `auth-api.ts` reads `process.env`). Deliberately a
 * second, independent `await` — not folded into `registerNodeTelemetry()` —
 * so auth secret resolution never depends on Application Insights being
 * configured. Same Node.js-runtime-only dynamic-import idiom as the
 * telemetry import, for the same Edge-bundle-exclusion reason.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ registerNodeTelemetry }, { resolveAuthSecretsFromKeyVault }] = await Promise.all([
      import("./instrumentation.node"),
      import("./instrumentation-auth-secrets.node"),
    ]);
    await Promise.all([registerNodeTelemetry(), resolveAuthSecretsFromKeyVault()]);
  }
}
