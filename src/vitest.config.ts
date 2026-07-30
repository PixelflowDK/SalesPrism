import path from "path";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for src/ — unit + isolation tests only (no browser/DOM
 * needed for anything under test today: tenant resolution, chat-service
 * pure helpers, sales-coach prompt building, admin CSV/tag logic). Kept
 * deliberately separate from `next build` — this file is never imported
 * by the Next.js build pipeline, so `npm run build` is unaffected.
 *
 * Path alias mirrors tsconfig.json's `@/*` -> `./*` (this file lives at
 * src/, same root tsconfig uses) so test files can import application code
 * the same way application code does.
 */
export default defineConfig({
  resolve: {
    // Array form (not object) so the more specific "@/ui" alias is tried
    // before the general "@" alias — object-key order isn't a reliable
    // guarantee for Vite's prefix-match alias resolution.
    alias: [
      { find: "@/ui", replacement: path.resolve(__dirname, "./features/ui") },
      { find: "@", replacement: path.resolve(__dirname, ".") },
      // `server-only` is a marker package: its default export (`index.js`)
      // unconditionally throws, and is only swapped for the no-op
      // `empty.js` when a bundler declares the "react-server" export
      // condition (which is what Next.js's server-component webpack layer
      // does). Vitest/Vite doesn't set that condition, so any module under
      // test with a bare `import "server-only"` would crash on import
      // otherwise. Aliasing straight to the package's own no-op `empty.js`
      // mirrors exactly what the "react-server" condition does in the real
      // build — not a behavior change, just picking the branch Next.js
      // would pick server-side.
      {
        find: "server-only",
        replacement: path.resolve(
          __dirname,
          "./node_modules/server-only/empty.js"
        ),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Vitest defaults to skipping the coverage report when any test
      // fails. This suite intentionally keeps a couple of tests RED to
      // document known application bugs (see chat-message-mapper.test.ts /
      // rag-tool.test.ts) — coverage visibility shouldn't disappear because
      // of that.
      reportOnFailure: true,
      include: ["features/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "features/**/components/**",
        "features/**/*.tsx",
      ],
    },
  },
});
