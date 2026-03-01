"use strict";

/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  ignorePatterns: ["node_modules/", "dist/", ".next/"],
  rules: {
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
};
