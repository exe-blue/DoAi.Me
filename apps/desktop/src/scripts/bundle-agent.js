/**
 * Bundles apps/desktop/src/agent into a single CJS file for dist.
 * All deps (ws, dotenv, @supabase/supabase-js, cron-parser, winston) and workspace/local imports
 * are inlined so dist needs no node_modules or workspace. Run before electron-builder;
 * extraResources copies agent-dist/ → resources/agent/.
 */
const path = require("path");
const fs = require("fs");
const esbuild = require("esbuild");

const desktopRoot = path.resolve(__dirname, "..", "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");
const entry = path.join(desktopRoot, "src", "agent", "agent.js");
const outDir = path.join(desktopRoot, "agent-dist");
const outfile = path.join(outDir, "agent.bundle.cjs");
const agentDir = path.join(desktopRoot, "src", "agent");

if (!fs.existsSync(entry)) {
  throw new Error("[bundle-agent] Entry not found: " + entry);
}

fs.mkdirSync(outDir, { recursive: true });

try {
  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    outfile,
    sourcemap: true,
    minify: false,
    keepNames: true,
    absWorkingDir: agentDir,
    nodePaths: [
      path.join(repoRoot, "node_modules"),
      path.join(desktopRoot, "node_modules"),
    ],
    external: ["electron", "fsevents"],
    logLevel: "info",
  });
} catch (err) {
  throw new Error("[bundle-agent] Build failed: " + (err.message || String(err)));
}

console.log("[bundle-agent] Wrote", outfile);
