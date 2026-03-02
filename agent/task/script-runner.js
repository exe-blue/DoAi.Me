/**
 * ScriptRunner — Phase 1 실행 엔진
 *
 * task_devices.config.snapshot.steps (WorkflowStep[]) 를 순서대로 실행.
 * 각 step.ops[].scriptRef.{scriptId,version} 으로 DB scripts 테이블에서 content를 가져와
 * Node vm 에서 실행. 결과는 ctx.log / ctx.xiaowei 를 통해 디바이스와 통신.
 *
 * Cache: (scriptId:version) → script row. 프로세스 수명 동안 유지.
 */
'use strict';

const vm = require('vm');
const sleep = require('../lib/sleep');
const logger = require('../lib/logger');

class ScriptRunner {
  /**
   * @param {object} xiaowei   XiaoweiClient instance
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(xiaowei, supabase) {
    this.xiaowei = xiaowei;
    this.supabase = supabase;
    /** @type {Map<string, object>} `${id}:${version}` → scripts row */
    this._cache = new Map();
  }

  // ── Script fetch ──────────────────────────────────────────────────────────

  /**
   * DB에서 script row 가져오기 (캐시 우선).
   * @param {string} scriptId
   * @param {number} version
   * @returns {Promise<{id:string,name:string,version:number,status:string,content:string,timeout_ms:number,type:string}>}
   */
  async _fetchScript(scriptId, version) {
    const key = `${scriptId}:${version}`;
    if (this._cache.has(key)) return this._cache.get(key);

    const { data, error } = await this.supabase
      .from('scripts')
      .select('id, name, version, status, content, timeout_ms, type')
      .eq('id', scriptId)
      .eq('version', version)
      .maybeSingle();

    if (error) throw new Error(`[ScriptRunner] script fetch error: ${error.message}`);
    if (!data) throw new Error(`[ScriptRunner] script not found: id=${scriptId} version=${version}`);
    if (data.status !== 'active') {
      throw new Error(`[ScriptRunner] script not active: ${data.name} (status=${data.status})`);
    }

    this._cache.set(key, data);
    return data;
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  /**
   * task_device 하나 실행.
   * task_device.config.snapshot.steps: WorkflowStep[] 필수.
   * device_target = connection_id ?? serial (heartbeat가 채움).
   *
   * @param {{id:string, config:object, device_serial?:string, device_target?:string}} taskDevice
   */
  async runTaskDevice(taskDevice) {
    const cfg      = taskDevice.config || {};
    const snapshot = cfg.snapshot || {};
    const steps    = Array.isArray(snapshot.steps) ? snapshot.steps : [];
    const inputs   = cfg.inputs || {};
    const serial   = taskDevice.device_target || taskDevice.device_serial;

    if (!serial) throw new Error(`[ScriptRunner] task_device ${taskDevice.id}: no device_target/device_serial`);
    if (steps.length === 0) throw new Error(`[ScriptRunner] task_device ${taskDevice.id}: snapshot.steps is empty`);

    logger.info('ScriptRunner', `start task_device=${taskDevice.id} steps=${steps.length}`, { serial });

    for (let si = 0; si < steps.length; si++) {
      const step = steps[si];
      const ops  = Array.isArray(step.ops) ? step.ops : [];

      for (let oi = 0; oi < ops.length; oi++) {
        const op  = ops[oi];
        const ref = op.scriptRef || {};
        const scriptId = ref.scriptId || ref.id;
        const version  = ref.version;

        if (!scriptId || typeof version !== 'number') {
          throw new Error(`[ScriptRunner] step ${si}.ops[${oi}]: invalid scriptRef (scriptId=${scriptId}, version=${version})`);
        }

        const script    = await this._fetchScript(scriptId, version);
        const params    = Object.assign({}, inputs, op.params || {});
        const timeoutMs = op.timeoutMs || script.timeout_ms || 180000;

        logger.info('ScriptRunner', `step ${si}.ops[${oi}] → ${script.name}@v${version}`, { serial, timeout_ms: timeoutMs });
        await this._runScript(script, serial, params, timeoutMs);
      }
    }

    logger.info('ScriptRunner', `done task_device=${taskDevice.id}`, { serial });
  }

  /**
   * vm.runInNewContext 로 스크립트 실행.
   * content 형식: `export default async function(ctx, params) { ... }`
   *  → export default 제거 후 expression 래핑.
   *
   * ctx 제공 API:
   *   ctx.serial      — 디바이스 ADB serial / connection_id
   *   ctx.log(msg)    — logger.info 래퍼
   *   ctx.sleep(ms)   — Promise sleep
   *   ctx.xiaowei     — XiaoweiClient (raw Xiaowei API 접근)
   *   ctx.adbShell(cmd) — xiaowei.adbShell(serial, cmd) 단축어
   *   ctx.tap(x, y)   — xiaowei.tap(serial, x, y) 단축어
   *
   * @param {{name:string, content:string, type:string}} script
   * @param {string} serial
   * @param {object} params
   * @param {number} timeoutMs
   */
  async _runScript(script, serial, params, timeoutMs) {
    // ESM "export default" → 표현식으로 변환
    let src = (script.content || '').trim();
    src = src.replace(/^export\s+default\s+/, '');
    // function 선언이면 표현식화
    if (/^async\s+function\b/.test(src) || /^function\b/.test(src)) {
      src = `(${src})`;
    }

    const xiaowei = this.xiaowei;
    const sandbox = {
      // Node globals 최소 노출
      console,
      setTimeout,
      clearTimeout,
      Promise,
      Error,
      JSON,
      Math,
      Array,
      Object,
      // script-facing
      __scriptFn: undefined,
    };

    let fn;
    try {
      fn = vm.runInNewContext(`(${src})`, sandbox);
    } catch (compileErr) {
      throw new Error(`[ScriptRunner] ${script.name}: compile error — ${compileErr.message}`);
    }

    if (typeof fn !== 'function') {
      throw new Error(`[ScriptRunner] ${script.name}: content did not evaluate to a function`);
    }

    const ctx = {
      serial,
      log:      (msg) => logger.info('Script', `[${script.name}] ${msg}`, { serial }),
      sleep,
      xiaowei,
      adbShell: (cmd)    => xiaowei.adbShell(serial, cmd),
      tap:      (x, y)   => xiaowei.tap(serial, x, y),
    };

    await Promise.race([
      fn(ctx, params),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`[ScriptRunner] ${script.name}: timeout after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }

  /** 캐시 비우기 (테스트 / 스크립트 재배포 시 사용). */
  clearCache() {
    this._cache.clear();
  }
}

module.exports = ScriptRunner;
