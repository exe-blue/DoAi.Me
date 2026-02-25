#!/usr/bin/env node
/**
 * Register YouTube channels via POST /api/youtube/register-channels.
 * Requires: npm run dev (or next start), and .env.local with API_KEY for API auth.
 *
 * Usage:
 *   node scripts/register-channels.mjs
 *   node scripts/register-channels.mjs "https://www.youtube.com/@Handle1" "@Handle2"
 *
 * If no URLs given, uses the 5 default handles below.
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env.local");

function loadEnvLocal() {
  if (!existsSync(envPath)) return {};
  const text = readFileSync(envPath, "utf8");
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

const defaults = [
  "https://www.youtube.com/@SUPERANT_AN",
  "https://www.youtube.com/@gamdongstockTV",
  "https://www.youtube.com/@closingpricebetting_TV",
  "https://www.youtube.com/@realstock_lab",
  "https://www.youtube.com/@hanriver_trading",
];

const handles = process.argv.slice(2).length ? process.argv.slice(2) : defaults;
const env = loadEnvLocal();
const API_KEY = process.env.API_KEY || env.API_KEY;
const baseUrl = process.env.BASE_URL || env.BASE_URL || "http://localhost:3000";

async function main() {
  const url = `${baseUrl}/api/youtube/register-channels`;
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) headers["x-api-key"] = API_KEY;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ handles }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Error:", res.status, data.error || data);
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
  console.log(
    "\n채널 %d개 등록, 영상 %d개 추가",
    data.summary?.channelsRegistered ?? 0,
    data.summary?.totalVideosAdded ?? 0
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
