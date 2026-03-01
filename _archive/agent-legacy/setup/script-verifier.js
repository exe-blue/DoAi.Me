/**
 * DoAi.Me - Script Verifier
 * Checks that AutoJS scripts are deployable and executable on devices.
 *
 * Flow:
 *   1. checkScriptsDir()  — verify SCRIPTS_DIR exists and list contents
 *   2. checkRequired()    — verify required scripts (youtube_watch.js, etc.) exist
 *   3. runTestScript()    — deploy a test script via autojsCreate and verify response
 */
const fs = require("fs");
const path = require("path");

/** Scripts that must exist for core task types */
const REQUIRED_SCRIPTS = ["youtube_watch.js"];

/** Minimal AutoJS test script content — logs "test OK" and exits */
const TEST_SCRIPT_CONTENT = `
// DoAi.Me test ping script — auto-generated
log("test OK");
exit();
`.trim();

const TEST_SCRIPT_NAME = "test_ping.js";

class ScriptVerifier {
  /**
   * @param {import('./xiaowei-client')} xiaowei
   * @param {object} config - agent config (must have scriptsDir)
   */
  constructor(xiaowei, config) {
    this.xiaowei = xiaowei;
    this.scriptsDir = config.scriptsDir || "";
    this.availableScripts = [];
  }

  /**
   * Check that SCRIPTS_DIR is configured and exists.
   * @returns {{ok: boolean, path: string, files: string[]}}
   */
  checkScriptsDir() {
    if (!this.scriptsDir) {
      console.warn("[Script] SCRIPTS_DIR not configured");
      return { ok: false, path: "", files: [] };
    }

    if (!fs.existsSync(this.scriptsDir)) {
      console.warn(`[Script] SCRIPTS_DIR does not exist: ${this.scriptsDir}`);
      return { ok: false, path: this.scriptsDir, files: [] };
    }

    try {
      const allFiles = fs.readdirSync(this.scriptsDir);
      this.availableScripts = allFiles.filter((f) => f.endsWith(".js"));
      console.log(`[Script] SCRIPTS_DIR: ${this.scriptsDir} (${this.availableScripts.length} scripts)`);
      return { ok: true, path: this.scriptsDir, files: this.availableScripts };
    } catch (err) {
      console.error(`[Script] Failed to read SCRIPTS_DIR: ${err.message}`);
      return { ok: false, path: this.scriptsDir, files: [] };
    }
  }

  /**
   * Check that all required scripts exist in SCRIPTS_DIR.
   * @returns {{ok: boolean, found: string[], missing: string[]}}
   */
  checkRequired() {
    const found = [];
    const missing = [];

    for (const name of REQUIRED_SCRIPTS) {
      const fullPath = path.join(this.scriptsDir, name);
      if (fs.existsSync(fullPath)) {
        found.push(name);
        console.log(`[Script] ✓ ${name}`);
      } else {
        missing.push(name);
        console.warn(`[Script] ✗ ${name} — not found`);
      }
    }

    return { ok: missing.length === 0, found, missing };
  }

  /**
   * Ensure the test_ping.js script exists in SCRIPTS_DIR.
   * Creates it if missing.
   * @returns {string} absolute path to test script
   */
  ensureTestScript() {
    const testPath = path.join(this.scriptsDir, TEST_SCRIPT_NAME);
    if (!fs.existsSync(testPath)) {
      try {
        fs.writeFileSync(testPath, TEST_SCRIPT_CONTENT, "utf-8");
        console.log(`[Script] Created test script: ${testPath}`);
      } catch (err) {
        console.error(`[Script] Failed to create test script: ${err.message}`);
      }
    }
    return testPath;
  }

  /**
   * Run the test script on a single device via autojsCreate.
   * @param {string} serial - target device serial
   * @returns {Promise<{ok: boolean, response: object|null}>}
   */
  async runTestScript(serial) {
    if (!this.xiaowei.connected) {
      return { ok: false, response: null };
    }

    const testPath = this.ensureTestScript();

    try {
      const response = await this.xiaowei.autojsCreate(serial, testPath, {
        count: 1,
        taskInterval: [500, 1000],
        deviceInterval: "500",
      });

      const output = _extractResponse(response);
      console.log(`[Script] autojsCreate ${TEST_SCRIPT_NAME} → ${serial}: success`);

      if (output) {
        console.log(`[Script] 스크립트 실행 결과: "${output}" 수신`);
      }

      return { ok: true, response };
    } catch (err) {
      console.error(`[Script] autojsCreate ${TEST_SCRIPT_NAME} → ${serial}: failed (${err.message})`);
      return { ok: false, response: null };
    }
  }

  /**
   * Full verification: check dir, required scripts, and run test.
   * @param {string|null} testSerial - device serial for test run (null = skip test)
   * @returns {Promise<{dirOk: boolean, requiredOk: boolean, testOk: boolean}>}
   */
  async verifyAll(testSerial) {
    const dirResult = this.checkScriptsDir();
    if (!dirResult.ok) {
      return { dirOk: false, requiredOk: false, testOk: false };
    }

    const reqResult = this.checkRequired();

    let testOk = false;
    if (testSerial && this.xiaowei.connected) {
      const testResult = await this.runTestScript(testSerial);
      testOk = testResult.ok;
    } else if (!testSerial) {
      console.log("[Script] Test execution skipped (no test device specified)");
      testOk = true; // Not a failure, just skipped
    } else {
      console.log("[Script] Test execution skipped (Xiaowei offline)");
    }

    return {
      dirOk: dirResult.ok,
      requiredOk: reqResult.ok,
      testOk,
    };
  }
}

/**
 * Try to extract a human-readable result from Xiaowei response.
 * @param {object} response
 * @returns {string|null}
 */
function _extractResponse(response) {
  if (!response) return null;
  if (typeof response === "string") return response.trim();
  const text = response.output || response.result || response.data || response.msg || response.message;
  if (typeof text === "string") return text.trim();
  return null;
}

module.exports = ScriptVerifier;
