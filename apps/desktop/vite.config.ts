import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import { startup } from "vite-plugin-electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Restart Electron when main or preload build finishes (dev only). */
function restartOnMainOrPreloadBuild() {
  return {
    name: "restart-electron-on-main-preload-build",
    apply: "serve",
    closeBundle() {
      if (process.electronApp) {
        startup.exit().then(() => startup());
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "src/main/index.ts",
        vite: {
          build: {
            rollupOptions: {
              external: ["ws", "bufferutil", "utf-8-validate"],
            },
          },
          plugins: [restartOnMainOrPreloadBuild()],
        },
      },
      preload: {
        input: "src/preload/bridge.ts",
        vite: {
          plugins: [restartOnMainOrPreloadBuild()],
        },
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: { outDir: "dist", emptyOutDir: true },
});
