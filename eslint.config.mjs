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
  ]),
  // Official React Bits LatticeLoader dipakai verbatim (hanya header sumber);
  // pola ref-during-render + setState-in-effect bawaan upstream dimatikan di sini.
  {
    files: ["components/micro/LatticeLoader.tsx"],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
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
