import NextAuth, { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import { Provider } from "next-auth/providers/index";
import { safeLog } from "@/features/common/services/safe-logger";
import { buildCanonicalUserId, hashValue } from "./helpers";
import { image } from "@markdoc/markdoc/dist/src/schema";
import { access } from "fs";

/**
 * ADR-003 — admin authorization by the verified Entra `oid` claim, never by
 * a client-supplied or mutable value. Replaces `ADMIN_EMAIL_ADDRESS` (see
 * the ADR's val1 investigation: the sole admin is an MSA-federated `#EXT#`
 * account whose `mail`/`preferred_username` claims are not stable across
 * logins, so an email/UPN allow-list was never actually safe here).
 */
// Exported for direct unit testing (see auth-api.test.ts) — no behavior
// change, these were already the pure decision points; testing them
// directly avoids having to simulate a full NextAuth OAuth round trip.
export const getAdminObjectIds = (): string[] =>
  process.env.ADMIN_OBJECT_IDS?.split(",")
    .map((oid) => oid.toLowerCase().trim())
    .filter((oid) => oid.length > 0) ?? [];

export const isAdminOid = (oid: string | undefined | null): boolean =>
  !!oid && getAdminObjectIds().includes(oid.toLowerCase());

const configureIdentityProvider = () => {
  const providers: Array<Provider> = [];

  if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: process.env.AUTH_GITHUB_ID!,
        clientSecret: process.env.AUTH_GITHUB_SECRET!,
        async profile(profile) {
          const image = await fetchProfilePicture(profile.avatar_url, null);
          // GitHub is NOT part of the approved val1 architecture (Entra ID
          // is the only supported IdP — see CLAUDE.md/SAD). It is left wired
          // here only because it predates that decision. A null `email` used
          // to throw here (`profile.email.toLowerCase()` on a GitHub account
          // with a private/unset public email) and crash sign-in; guarded
          // now regardless. GitHub tokens carry no Entra `oid`/`tid`, so
          // under ADR-003 a GitHub-authenticated session can never satisfy
          // `canonicalUserId()`/`currentUserId()` (fails closed) and can
          // never be admin (`isAdminOid` requires a real `oid`) — it can
          // authenticate but not own or access any tenant data.
          const email = profile.email ? profile.email.toLowerCase() : null;
          const newProfile = {
            ...profile,
            email,
            isAdmin: false,
            image: image,
          };
          // SR-012 — same leak as the Entra branch below: this logged the full
          // GitHub profile including email and avatar. No canonical id exists
          // for this provider (that is the whole point of the comment above),
          // so there is nothing safe to correlate on beyond the event itself.
          safeLog.info("auth.github.profile-mapped", { eventType: "login" });
          return newProfile;
        },
      })
    );
  }

  if (
    process.env.AZURE_AD_CLIENT_ID &&
    process.env.AZURE_AD_CLIENT_SECRET &&
    process.env.AZURE_AD_TENANT_ID
  ) {
    providers.push(
      AzureADProvider({
        clientId: process.env.AZURE_AD_CLIENT_ID!,
        clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
        tenantId: process.env.AZURE_AD_TENANT_ID!,
        authorization: {
          params: {
            scope: "openid profile User.Read",
          },
        },
        /**
         * REQUIRED for ADR-003. Without this, next-auth's OAuth callback takes its
         * `else` branch (`core/lib/oauth/callback.js`) and builds `profile` from
         * Microsoft's OIDC **userinfo endpoint**, which returns only
         * `sub, name, family_name, given_name, picture, email` — it carries neither
         * `oid` nor `tid`. The canonical identity would then be underivable and, being
         * fail-closed by design, every sign-in would be rejected after a *successful*
         * Entra authentication. That was the live val1 defect: login succeeded at
         * Microsoft, then bounced back to the login screen.
         *
         * With `idToken: true`, next-auth instead uses `tokens.claims()` — the verified
         * **ID token** — which does carry `oid` and `tid`. This is the stricter path,
         * not a looser one: `client.callback()` performs full OIDC validation
         * (signature, issuer, audience, nonce) on that token, whereas the userinfo
         * path trusts a separate bearer-authenticated HTTP response.
         *
         * Note the ID token has no `email` claim for accounts without a `mail`
         * attribute (true for this tenant's MSA-federated `#EXT#` member), so the
         * display-only email below correctly falls through to `preferred_username`.
         * That is a DISPLAY attribute only — never ownership (ADR-003).
         */
        idToken: true,
        async profile(profile, tokens) {
          // `email`/`preferred_username` are display/contact attributes only
          // (ADR-003) — never used for ownership or admin authorization.
          const email = profile.email || profile.preferred_username || "";
          const image = await fetchProfilePicture(`https://graph.microsoft.com/v1.0/me/photos/48x48/$value`, tokens.access_token);
          // Standard Entra v2 ID token claims, present on the raw decoded
          // profile object even though they aren't in next-auth's narrow
          // `AzureADProfile` type (see ADR-003 — the val1 investigation
          // confirmed both are present for the val1 tenant's admin token).
          const oid: string | undefined = (profile as { oid?: string }).oid;
          const tid: string | undefined = (profile as { tid?: string }).tid;
          if (!oid || !tid) {
            // Fail loudly at the boundary rather than minting a session that
            // cannot own anything. Previously these were silently undefined
            // (userinfo endpoint — see `idToken: true` above), producing a
            // successful Entra login followed by an unusable session and a
            // bounce back to the login screen with nothing in the logs
            // explaining why. Codes only — never claim values.
            console.error(
              JSON.stringify({
                code: "auth.entra.missing-identity-claims",
                hasOid: !!oid,
                hasTid: !!tid,
                claimNames: Object.keys(profile ?? {}).sort(),
              })
            );
            throw new Error(
              "ADR-003: Entra token is missing the oid/tid claims required to derive a canonical identity."
            );
          }
          const newProfile = {
            ...profile,
            email,
            id: profile.sub,
            oid,
            tenantId: tid,
            isAdmin: isAdminOid(oid),
            image: image,
          };
          // SR-012: this was `console.log("Azure AD profile:", newProfile)`,
          // which printed the ENTIRE ID-token claim set plus email, oid,
          // tenant id and a base64 data-URL of the user's profile photo. That
          // was inert while console output went nowhere durable — SR-010's
          // OpenTelemetry `console` bridge changed that, and every sign-in
          // then shipped that payload into Application Insights, which no
          // erasure path reaches. Only the canonical id is logged now (an
          // allow-listed field, and the same value already stored as the
          // Cosmos partition key).
          safeLog.info("auth.entra.profile-mapped", {
            userId: buildCanonicalUserId(tid, oid),
            eventType: "login",
          });
          return newProfile;
        },
      })
    );
  }

  // If we're in local dev, add a basic credential provider option as well
  // (Useful when a dev doesn't have access to create app registration in their tenant)
  // This currently takes any username and makes a user with it, ignores password
  // Refer to: https://next-auth.js.org/configuration/providers/credentials
  if (process.env.NODE_ENV === "development") {
    providers.push(
      CredentialsProvider({
        name: "localdev",
        credentials: {
          username: { label: "Username", type: "text", placeholder: "dev" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials, req): Promise<any> {
          // You can put logic here to validate the credentials and return a user.
          // We're going to take any username and make a new user with it.
          // There is no real Entra token here, so `oid`/`tid` are
          // synthesized (stable per username, NOT real GUIDs) purely so
          // local dev sessions can satisfy ADR-003's `canonicalUserId()`
          // fail-closed check without an Azure AD app registration. This is
          // a local-dev-only affordance — it never runs in production
          // (`NODE_ENV === "development"` guard above) and is NOT the "no
          // fallback to email" violation the ADR forbids: production
          // sessions always come from the Azure AD provider's verified
          // token claims above, never from this branch.
          const username = credentials?.username || "dev";
          const email = username + "@localhost";
          const devOid = hashValue(email);
          const devTenantId = "local-dev";
          const user = {
            id: devOid,
            name: username,
            email: email,
            oid: devOid,
            tenantId: devTenantId,
            isAdmin: isAdminOid(devOid),
            image: "",
          };
          // Dev-only provider (guarded by NODE_ENV === "development" above), so
          // this never reaches a deployed environment's telemetry. Still routed
          // through safeLog so the app has exactly one logging boundary and a
          // future refactor cannot accidentally promote this to production.
          safeLog.info("auth.dev-credentials.login", {
            userId: buildCanonicalUserId(devTenantId, devOid),
            eventType: "login",
          });
          return user;
        },
      })
    );
  }

  return providers;
};

export const fetchProfilePicture = async (profilePictureUrl: string, accessToken: any): Promise<any> => {
  var image = null
  const profilePicture = await fetch(
    profilePictureUrl,
    accessToken && {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (profilePicture.ok) {
    const pictureBuffer = await profilePicture.arrayBuffer();
    const pictureBase64 = Buffer.from(pictureBuffer).toString("base64");
    image = `data:image/jpeg;base64,${pictureBase64}`;
  }
  else {
    // The URL is a per-user Graph endpoint and the status text is upstream
    // prose — neither belongs in telemetry. The status code is enough to tell
    // a 403 (missing User.Read consent) from a 404 (no photo set).
    safeLog.warn("auth.profile-picture.fetch-failed", {
      statusCode: profilePicture.status,
    });
  }
  return image;
};


export const options: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [...configureIdentityProvider()],
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only defined on the FIRST jwt() call right after sign-in
      // (NextAuth JWT-strategy contract) — every later call re-uses what
      // was already persisted onto `token` below.
      if (user?.isAdmin) {
        token.isAdmin = user.isAdmin;
      }
      // ADR-003 — persist the verified oid/tid claims onto the encrypted
      // session JWT so every subsequent request's session carries the
      // canonical `${tenantId}:${oid}` identity without a repeated IdP
      // round trip. Never persist email/preferred_username here for
      // identity purposes — only `isAdmin`/`oid`/`tenantId` matter for
      // authorization/ownership; display fields already come from the
      // session's own `name`/`email`/`image`.
      if (user?.oid) {
        token.oid = user.oid;
      }
      if (user?.tenantId) {
        token.tenantId = user.tenantId;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.isAdmin = token.isAdmin as boolean;
      session.user.oid = token.oid as string | undefined;
      session.user.tenantId = token.tenantId as string | undefined;
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
};

export const handlers = NextAuth(options);
