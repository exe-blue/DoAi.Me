/**
 * Script cache and executor: fetch scripts from DB (status=active only),
 * cache as <id>/<version>.mjs, run with op-level timeout and standardized result/error.
 */
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { getLogger } = require("./common/logger");

const log = getLogger("script-cache");

const DEFAULT_CACHE_DIR = path.join(__dirname, ".script-cache");

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} scriptId - UUID
 * @param {number} version
 * @returns {Promise<{ id: string, name: string, version: number, status: string, type: string, content: string, timeout_ms: number }|null>}
 */
async function fetchScript(supabase, scriptId, version) {
  const { data, error } = await supabase
    .from("scripts")
    .select("id, name, version, status, type, content, timeout_ms")
    .eq("id", scriptId)
    .eq("version", version)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    log.warn("[script-cache] fetchScript error: %s", error.message);
    return null;
  }
  if (!data) {
    log.warn("[script-cache] script not found or not active: %s@%s", scriptId, version);
    return null;
  }
  return data;
}

/**
 * Write script content to cache dir as <id>/<version>.mjs.
 * @param {object} script - { id, version, content }
 * @param {string} [cacheDir]
 * @returns {Promise<string>} absolute path to the .mjs file
 */
async function ensureCached(script, cacheDir = DEFAULT_CACHE_DIR) {
  const dir = path.join(cacheDir, String(script.id));
  const filePath = path.join(dir, `${script.version}.mjs`);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath, script.content, "utf8");
  return filePath;
}

/**
 * Dynamic import of a local .mjs file.
 * @param {string} filePath - absolute path to .mjs
 * @returns {Promise<{ default?: (ctx: object, params: object) => Promise<unknown> }>}
 */
async function loadModule(filePath) {
  const url = pathToFileURL(filePath).href;
  return import(url);
}

/**
 * Run a script by scriptRef with timeout. Fetches from DB (active only), caches, then runs.
 * Standardized return: { ok, result?, error?, timedOut?, retryable? }.
 *
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabase
 * @param {string} opts.scriptId - UUID
 * @param {number} opts.version
 * @param {object} opts.ctx - passed to script (e.g. { target, xiaowei, taskDeviceId })
 * @param {object} [opts.params] - step params
 * @param {number} [opts.timeoutMs] - op-level timeout (default from script.timeout_ms or 180000)
 * @param {string} [opts.cacheDir]
 * @returns {Promise<{ ok: boolean, result?: unknown, error?: string, timedOut?: boolean, retryable?: boolean }>}
 */
async function runScript(
  { supabase, scriptId, version, ctx, params = {}, timeoutMs, cacheDir = DEFAULT_CACHE_DIR },
) {
  const script = await fetchScript(supabase, scriptId, version);
  if (!script) {
    return { ok: false, error: "Script not found or not active", retryable: false };
  }

  const effectiveTimeout = timeoutMs ?? script.timeout_ms ?? 180000;
  let filePath;
  try {
    filePath = await ensureCached(script, cacheDir);
  } catch (err) {
    log.error("[script-cache] ensureCached failed: %s", err.message);
    return { ok: false, error: err.message, retryable: true };
  }

  let mod;
  try {
    mod = await loadModule(filePath);
  } catch (err) {
    log.error("[script-cache] loadModule failed: %s", err.message);
    return { ok: false, error: `Load failed: ${err.message}`, retryable: false };
  }

  const run = mod.default ?? mod.run ?? mod;
  if (typeof run !== "function") {
    return { ok: false, error: "Script has no default or run export", retryable: false };
  }

  const runPromise = Promise.resolve(run(ctx, params));
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("SCRIPT_TIMEOUT")), effectiveTimeout),
  );

  try {
    const result = await Promise.race([runPromise, timeoutPromise]);
    return { ok: true, result };
  } catch (err) {
    const timedOut = err.message === "SCRIPT_TIMEOUT";
    const retryable = err.retryable !== false && !timedOut;
    return {
      ok: false,
      error: err.message || String(err),
      timedOut,
      retryable,
    };
  }
}

module.exports = {
  fetchScript,
  ensureCached,
  loadModule,
  runScript,
  DEFAULT_CACHE_DIR,
};
