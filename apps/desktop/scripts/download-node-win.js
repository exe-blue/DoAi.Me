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

function get(url, followRedirect = true) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (followRedirect && res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location) {
        const next = res.headers.location.startsWith("http") ? res.headers.location : new URL(res.headers.location, url).href;
        res.destroy();
        get(next, false).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          const snippet = body.length > 0 ? body.slice(0, 500).toString("utf8").replace(/\s+/g, " ") : "(empty)";
          reject(new Error(`HTTP ${res.statusCode} ${url} body: ${snippet}`));
          return;
        }
        resolve(body);
      });
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const zipName = `node-v${NODE_VERSION}-win-x64.zip`;
  const zipUrl = `${BASE}/v${NODE_VERSION}/${zipName}`;
  console.log("Downloading", zipUrl);
  let zipBuf;
  try {
    zipBuf = await get(zipUrl);
  } catch (e) {
    console.error("[download-node-win] GET failed:", zipUrl, e.message);
    throw e;
  }
  if (zipBuf.length < 1000) {
    console.error("[download-node-win] Response too small:", zipUrl, "bytes:", zipBuf.length);
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
  console.error("[download-node-win] Error:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
