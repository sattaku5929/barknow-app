import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Node CommonJS test harnesses are executed by Node, not bundled as Next.js application code.
  // Preserve their existing conventions while keeping application lint checks enabled.
  { files: ["tests/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off", "@next/next/no-assign-module-variable": "off" } },
  // Existing mount-time initialization is intentionally stateful; refactor separately
  // with regression coverage rather than changing app behavior in this CI repair.
  { files: ["app/page.tsx", "components/admin/AdminMfaGate.tsx"], rules: { "react-hooks/set-state-in-effect": "off" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
