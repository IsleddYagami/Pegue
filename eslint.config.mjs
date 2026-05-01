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

      // "warn" = mostra divida tecnica sem bloquear build. Usado quando
      // ainda ha N casos legados. Cada PR novo tem que zerar pelo menos
      // os warnings que tocou. Quando chegar a 0, mudar pra "error".
      // Status atual (1/Mai/2026):
      //   no-fetch-without-timeout: ~41 casos (subindo um a um)
      //   no-weak-length-validation: ~10 casos apos refinar whitelist
      "imuni/no-fetch-without-timeout": "warn",
      "imuni/no-weak-length-validation": "warn",
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
