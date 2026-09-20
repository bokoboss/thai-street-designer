import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-vercel/**",
    ".sites-runtime/**",
    "dist/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // These workspace components intentionally synchronize browser/local UI state
    // (autosave recovery, export previews and inline section edit cancellation)
    // in effects. The state transitions are guarded and covered by regressions.
    files: ["app/junction/page.tsx", "app/junction/section-view.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Geometry hit-shapes are deliberately memoized because hover state changes
    // frequently; recomputing the full geometry on every hover is undesirable.
    files: ["app/junction/object-layer.tsx"],
    rules: {
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
