import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import imuni from "./tools/eslint-imuni/index.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // IMUNI Camada 1B — regras custom que matam categorias inteiras de bug.
  // Cada regra entra apos bug ser caçado pelo menos uma vez (1/Mai/2026).
  // Documentacao: src/lib/imuni/README.md
  {
    plugins: { imuni },
    rules: {
      // "error" = falha build se aparecer. Usado quando ja zeramos todos
      // os casos legados. JSON.parse era unico caso e foi fixado.
      "imuni/no-json-parse-without-try": "error",

      // Ambas zeradas em 1/Mai/2026 — qualquer regressao falha build.
      "imuni/no-fetch-without-timeout": "error",
      "imuni/no-weak-length-validation": "error",

      // any types: warn (nao bloqueia). Codebase legado tem ~50 any que
      // serao migrados gradualmente quando IMUNI Camada 1 evoluir pra
      // tipar nullability tambem (hoje eh non-null pragmatico).
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Plugin IMUNI eh JS puro, sem precisar lint dele mesmo
    "tools/**",
  ]),
]);

export default eslintConfig;
