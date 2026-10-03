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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Kode vendored verbatim dari registry resmi (evilcharts.com) — paralel
    // dengan animate-ui di bawah, tapi terlalu luas untuk override per-file.
    "components/evilcharts/**",
  ]),
  // Official Animate UI dipakai verbatim via registry resmi;
  // pola bawaan upstream dimatikan per-file, tanpa ubah perilaku.
  {
    files: ["components/animate-ui/primitives/animate/slot.tsx"],
    rules: {
      "react-hooks/static-components": "off",
    },
  },
  {
    files: ["components/animate-ui/primitives/effects/theme-toggler.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
