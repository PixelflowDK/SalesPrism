import NextAuth, { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import { Provider } from "next-auth/providers/index";
import { hashValue } from "./helpers";
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
          console.log("GitHub profile:", newProfile);
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
          const newProfile = {
            ...profile,
            email,
            id: profile.sub,
            oid,
            tenantId: tid,
            isAdmin: isAdminOid(oid),
            image: image,
          };
          console.log("Azure AD profile:", newProfile);
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
          console.log(
            "=== DEV USER LOGGED IN:\n",
            JSON.stringify(user, null, 2,
            )
          );
          return user;
        },
      })
    );
  }

  return providers;
};

export const fetchProfilePicture = async (profilePictureUrl: string, accessToken: any): Promise<any> => {
  console.log("Fetching profile picture...");
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
    console.log("Profile picture fetched successfully.");
    const pictureBuffer = await profilePicture.arrayBuffer();
    const pictureBase64 = Buffer.from(pictureBuffer).toString("base64");
    image = `data:image/jpeg;base64,${pictureBase64}`;
  }
  else {
    console.error("Failed to fetch profile picture:", profilePictureUrl, profilePicture.statusText);
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
