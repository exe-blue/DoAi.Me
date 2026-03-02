import { defineConfig } from "vitest/config";
import path from "path";

// Tests remain at repo root; using absolute paths for robustness
const testsRoot = path.resolve(__dirname, "../../tests");

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [path.join(testsRoot, "**/*.test.ts")],
    setupFiles: [path.join(testsRoot, "setup.ts")],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
