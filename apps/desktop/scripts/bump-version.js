/**
 * Bumps patch version in apps/desktop/package.json so each build gets a new version.
 * Used before dist so electron-updater can see a newer release on GitHub.
 */
const fs = require("fs");
const path = require("path");

const pkgPath = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const parts = pkg.version.split(".").map(Number);
if (parts.length !== 3 || parts.some(isNaN)) {
  console.error("[bump-version] Invalid version:", pkg.version);
  process.exit(1);
}
const oldVersion = pkg.version;
parts[2] += 1;
const newVersion = parts.join(".");
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
console.log("[bump-version]", oldVersion, "->", newVersion);
