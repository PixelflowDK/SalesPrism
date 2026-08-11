import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SR-001/SD-004 — see instrumentation-auth-secrets.node.ts for the full
 * outage writeup. These tests exercise the pure secret-resolution
 * behaviour: skip-if-already-real, treat an unresolved
 * `@Microsoft.KeyVault(...)` reference string as absent, fetch-and-assign
 * on success, and log-loudly-never-throw on failure — never a secret
 * VALUE anywhere in a log call.
 */

const getSecretMock = vi.fn();
const vaultInstanceMock = vi.fn(() => ({ getSecret: getSecretMock }));
const safeLogErrorMock = vi.fn();

vi.mock("@/features/common/services/key-vault", () => ({
  AzureKeyVaultInstance: vaultInstanceMock,
}));

vi.mock("@/features/common/services/safe-logger", () => ({
  safeLog: { error: safeLogErrorMock, warn: vi.fn(), info: vi.fn() },
}));

const ORIGINAL_ENV = { ...process.env };

const loadModule = async () => {
  vi.resetModules();
  return await import("./instrumentation-auth-secrets.node");
};

/**
 * `src/types/type.ts` declares `AZURE_AD_CLIENT_SECRET` / `NEXTAUTH_SECRET` /
 * `AZURE_KEY_VAULT_NAME` as required (non-optional) `NodeJS.ProcessEnv`
 * members app-wide, so `delete process.env.X` is a type error (TS2790 —
 * operand of `delete` must be optional) even though it's a legitimate thing
 * to do in a test. Route through an explicitly-optional-typed view of the
 * same object instead of touching that global declaration.
 */
const deleteEnv = (key: string): void => {
  delete (process.env as Record<string, string | undefined>)[key];
};

describe("resolveAuthSecretsFromKeyVault", () => {
  beforeEach(() => {
    getSecretMock.mockReset();
    vaultInstanceMock.mockClear();
    safeLogErrorMock.mockReset();
    process.env = { ...ORIGINAL_ENV };
    process.env.AZURE_KEY_VAULT_NAME = "kv-azurechat-val1";
    deleteEnv("AZURE_AD_CLIENT_SECRET");
    deleteEnv("NEXTAUTH_SECRET");
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("does nothing when no vault is configured (local dev)", async () => {
    deleteEnv("AZURE_KEY_VAULT_NAME");
    const { resolveAuthSecretsFromKeyVault } = await loadModule();
    await resolveAuthSecretsFromKeyVault();
    expect(vaultInstanceMock).not.toHaveBeenCalled();
  });

  it("fetches and assigns both secrets when absent", async () => {
    getSecretMock.mockImplementation(async (name: string) => ({
      value: name === "azure-ad-client-secret" ? "real-client-secret" : "real-nextauth-secret",
    }));
    const { resolveAuthSecretsFromKeyVault } = await loadModule();
    await resolveAuthSecretsFromKeyVault();

    expect(process.env.AZURE_AD_CLIENT_SECRET).toBe("real-client-secret");
    expect(process.env.NEXTAUTH_SECRET).toBe("real-nextauth-secret");
    expect(getSecretMock).toHaveBeenCalledWith("azure-ad-client-secret");
    expect(getSecretMock).toHaveBeenCalledWith("nextauth-secret");
    expect(safeLogErrorMock).not.toHaveBeenCalled();
  });

  it("never overwrites an already-real value", async () => {
    process.env.AZURE_AD_CLIENT_SECRET = "already-set-value";
    getSecretMock.mockResolvedValue({ value: "from-vault" });
    const { resolveAuthSecretsFromKeyVault } = await loadModule();
    await resolveAuthSecretsFromKeyVault();

    expect(process.env.AZURE_AD_CLIENT_SECRET).toBe("already-set-value");
    expect(getSecretMock).toHaveBeenCalledTimes(1); // only NEXTAUTH_SECRET
    expect(getSecretMock).toHaveBeenCalledWith("nextauth-secret");
  });

  it("treats an unresolved Key Vault reference string as absent, not real", async () => {
    process.env.AZURE_AD_CLIENT_SECRET =
      "@Microsoft.KeyVault(SecretUri=https://kv-azurechat-val1.vault.azure.net/secrets/azure-ad-client-secret/)";
    getSecretMock.mockResolvedValue({ value: "resolved-from-vault" });
    const { resolveAuthSecretsFromKeyVault } = await loadModule();
    await resolveAuthSecretsFromKeyVault();

    expect(process.env.AZURE_AD_CLIENT_SECRET).toBe("resolved-from-vault");
  });

  it("logs a structured, value-free error and leaves the env var unset when the fetch throws", async () => {
    class FakeRestError extends Error {
      code = "Forbidden";
    }
    getSecretMock.mockImplementation(async (name: string) => {
      if (name === "azure-ad-client-secret") throw new FakeRestError("secret value should never appear here");
      return { value: "real-nextauth-secret" };
    });
    const { resolveAuthSecretsFromKeyVault } = await loadModule();
    await expect(resolveAuthSecretsFromKeyVault()).resolves.toBeUndefined();

    expect(process.env.AZURE_AD_CLIENT_SECRET).toBeUndefined();
    expect(process.env.NEXTAUTH_SECRET).toBe("real-nextauth-secret");
    expect(safeLogErrorMock).toHaveBeenCalledWith("auth.keyvault.fetch-failed", {
      secretName: "azure-ad-client-secret",
      errorCode: "Forbidden",
    });

    // Never logs the raw error / message / stack — codes only.
    const loggedFields = safeLogErrorMock.mock.calls.map((call) => JSON.stringify(call));
    expect(loggedFields.join("\n")).not.toMatch(/secret value should never appear here/);
  });

  it("logs a structured error and does not assign when the vault returns an empty value", async () => {
    getSecretMock.mockResolvedValue({ value: undefined });
    const { resolveAuthSecretsFromKeyVault } = await loadModule();
    await resolveAuthSecretsFromKeyVault();

    expect(process.env.AZURE_AD_CLIENT_SECRET).toBeUndefined();
    expect(safeLogErrorMock).toHaveBeenCalledWith("auth.keyvault.fetch-failed", {
      secretName: "azure-ad-client-secret",
      errorCode: "empty-secret-value",
    });
  });

  it("never throws — a fetch failure must not crash server boot", async () => {
    getSecretMock.mockRejectedValue(new Error("network unreachable"));
    const { resolveAuthSecretsFromKeyVault } = await loadModule();
    await expect(resolveAuthSecretsFromKeyVault()).resolves.toBeUndefined();
  });
});
