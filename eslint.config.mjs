import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";

const { flatConfig: nextFlatConfig } = nextPlugin;

export default defineConfig([
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**"]),
  nextFlatConfig.coreWebVitals,
]);
