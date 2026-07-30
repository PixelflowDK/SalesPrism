import { TenantThemeStyle } from "@/features/theme/tenant-theme-style";
import { AI_NAME } from "@/features/theme/theme-config";
import { ThemeProvider } from "@/features/theme/theme-provider";
import { EnsureTenantTheme, TenantTheme } from "@/features/theme/tenant-theme";
import { resolveTenantSlug } from "@/features/theme/tenant-resolver";
import { Toaster } from "@/features/ui/toaster";
import { cn } from "@/ui/lib";
import { DM_Mono, DM_Sans, Playfair_Display } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

// DESIGN.md §3.2 — self-hosted via next/font, zero external network
// request at runtime, zero layout shift. Do not replace with a <link>
// tag to fonts.googleapis.com.
const fontDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const fontBody = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-body",
  display: "swap",
});
const fontMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: AI_NAME,
  description: AI_NAME,
};

export const dynamic = "force-dynamic";

/**
 * Resolves the current tenant's theme from the `Host` header (SAD §5.3,
 * §10.2). Fails open to the standard Sales Prism theme (`null`) rather
 * than crashing the whole app — e.g. local dev without a configured
 * Cosmos DB backing store, or a transient Cosmos outage, must not take
 * down every page (including the public login page).
 */
async function getRequestTenantTheme(): Promise<TenantTheme | null> {
  try {
    const requestHeaders = await headers();
    const tenantSlug = resolveTenantSlug(requestHeaders.get("host"));
    const result = await EnsureTenantTheme(tenantSlug);
    return result.status === "OK" ? result.response : null;
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenantTheme = await getRequestTenantTheme();

  return (
    <html
      lang="en"
      className={cn(
        fontDisplay.variable,
        fontBody.variable,
        fontMono.variable,
        "h-full w-full overflow-hidden text-sm"
      )}
      suppressHydrationWarning
    >
      <body className={cn("h-full w-full flex bg-background font-body")}>
        <TenantThemeStyle tenantTheme={tenantTheme} />
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
