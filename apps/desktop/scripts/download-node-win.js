/**
 * Downloads Node.js Windows x64 executable for embedding in the desktop build.
 * Output: node-bundle/node.exe (and node-bundle/*.dll if needed)
 * Used so the packaged app can run the agent without requiring system Node.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const NODE_VERSION = "20.18.0";
const BASE = "https://nodejs.org/dist";
const OUT_DIR = path.join(__dirname, "..", "node-bundle");

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { redirect: "follow" }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const zipName = `node-v${NODE_VERSION}-win-x64.zip`;
  const zipUrl = `${BASE}/v${NODE_VERSION}/${zipName}`;
  console.log("Downloading", zipUrl);
  const zipBuf = await get(zipUrl);
  if (zipBuf.length < 1000) {
    throw new Error(`Download failed or empty: ${zipBuf.length} bytes`);
  }
  const zipPath = path.join(OUT_DIR, zipName);
  fs.writeFileSync(zipPath, zipBuf);

  const AdmZip = require("adm-zip");
  const zip = new AdmZip(zipPath);
  const entryPrefix = `node-v${NODE_VERSION}-win-x64/`;
  const entries = zip.getEntries();
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.replace(entryPrefix, "").replace(/^[^/]+[/\\]/, "");
    const base = path.basename(name);
    if (base === "node.exe" || base.endsWith(".dll")) {
      const outPath = path.join(OUT_DIR, base);
      fs.writeFileSync(outPath, entry.getData());
      console.log("Extracted", base, "->", outPath);
    }
  }
  fs.unlinkSync(zipPath);
  if (!fs.existsSync(path.join(OUT_DIR, "node.exe"))) {
    throw new Error("node.exe not found after extract");
  }
  console.log("Done. node.exe is in", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
