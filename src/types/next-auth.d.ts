import { DefaultSession } from "next-auth";

// https://next-auth.js.org/getting-started/typescript#module-augmentation

declare module "next-auth" {
  interface Session {
    user: {
      isAdmin: boolean;
      /** Entra v2 ID token `oid` claim (ADR-003) — the immutable directory object id. Undefined for providers that don't supply it. */
      oid?: string;
      /** Entra v2 ID token `tid` claim (ADR-003) — the directory tenant id. */
      tenantId?: string;
    } & DefaultSession["user"];
  }

  interface Token {
    isAdmin: boolean;
    oid?: string;
    tenantId?: string;
  }

  interface User {
    isAdmin: boolean;
    /** Entra v2 ID token `oid` claim (ADR-003), carried from the provider's `profile()`/`authorize()` callback through `jwt()` onto the token. */
    oid?: string;
    /** Entra v2 ID token `tid` claim (ADR-003). */
    tenantId?: string;
  }
}
