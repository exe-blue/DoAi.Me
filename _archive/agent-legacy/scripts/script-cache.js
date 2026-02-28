/**
 * Scripts on-demand executor: (scriptId, version) → scripts 조회, status='active' 강제.
 * 로컬 캐시: cache/scripts/<scriptId>/<version>.mjs → import() 로드, default export async function(ctx, params) 실행.
 * timeoutMs 강제: Promise.race(run, timeout).
 */
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { getLogger } = require("./common/logger");

const log = getLogger("script-cache");

/** Cache base: agent/cache/scripts */
const DEFAULT_CACHE_DIR = path.join(__dirname, "cache", "scripts");

/**
 * Fetch script from DB by (id, version). Throws if not found or status !== 'active' (강제 규칙 4).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} scriptId - UUID
 * @param {number} version
 * @returns {Promise<{ id: string, name: string, version: number, status: string, type: string, content: string, timeout_ms: number }>}
 */
async function getActiveScript(supabase, scriptId, version) {
  const { data, error } = await supabase
    .from("scripts")
    .select("id, name, version, status, type, content, timeout_ms")
    .eq("id", scriptId)
    .eq("version", version)
    .maybeSingle();

  if (error) {
    log.warn("[script-cache] getActiveScript error: %s", error.message);
    throw new Error(`Script fetch failed: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Script not found: id=${scriptId} version=${version}`);
  }
  if (data.status !== "active") {
    throw new Error(
      `Script not active (status=${data.status}): id=${scriptId} version=${version}`,
    );
  }
  return data;
}

/**
 * Write script content to cache dir as <id>/<version>.mjs (on-demand sync).
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
 * Dynamic import of a local .mjs file. Runs default export async function(ctx, params).
 * @param {string} filePath - absolute path to .mjs
 * @returns {Promise<{ default?: (ctx: object, params: object) => Promise<unknown> }>}
 */
async function loadModule(filePath) {
  const url = pathToFileURL(filePath).href;
  return import(url);
}

/**
 * Run a script by scriptRef with op-level timeout (Promise.race).
 * Uses getActiveScript (throws if not active), ensures cached, then runs default(ctx, params).
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabase
 * @param {string} opts.scriptId - UUID
 * @param {number} opts.version
 * @param {object} opts.ctx - passed to script
 * @param {object} [opts.params] - step params
 * @param {number} [opts.timeoutMs] - op timeout (default from script.timeout_ms or 180000)
 * @param {string} [opts.cacheDir]
 * @returns {Promise<{ ok: boolean, result?: unknown, error?: string, timedOut?: boolean, retryable?: boolean }>}
 */
async function runScript({
  supabase,
  scriptId,
  version,
  ctx,
  params = {},
  timeoutMs,
  cacheDir = DEFAULT_CACHE_DIR,
}) {
  let script;
  try {
    script = await getActiveScript(supabase, scriptId, version);
  } catch (err) {
    return {
      ok: false,
      error: err.message || String(err),
      retryable: false,
    };
  }

  const effectiveTimeout = Number(timeoutMs ?? script.timeout_ms ?? 180000);
  if (!Number.isFinite(effectiveTimeout) || effectiveTimeout <= 0) {
    return { ok: false, error: "Invalid timeoutMs", retryable: false };
  }

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
    return {
      ok: false,
      error: `Load failed: ${err.message}`,
      retryable: false,
    };
  }

  const run = mod.default ?? mod.run ?? mod;
  if (typeof run !== "function") {
    return {
      ok: false,
      error: "Script has no default or run export",
      retryable: false,
    };
  }

  const runPromise = Promise.resolve(run(ctx, params));
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(Object.assign(new Error("SCRIPT_TIMEOUT"), { timedOut: true })),
      effectiveTimeout,
    ),
  );

  try {
    const result = await Promise.race([runPromise, timeoutPromise]);
    return { ok: true, result };
  } catch (err) {
    const timedOut = err.message === "SCRIPT_TIMEOUT" || err.timedOut === true;
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
  getActiveScript,
  ensureCached,
  loadModule,
  runScript,
  DEFAULT_CACHE_DIR,
};
