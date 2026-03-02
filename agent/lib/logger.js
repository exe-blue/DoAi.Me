/**
 * Structured logging for agent (Rule G).
 * Fields: timestamp, level, module; optional: pc_id, device_id, device_serial, task_device_id, task_id.
 * Use for scheduling/orchestration paths; avoid excessive INFO (use DEBUG + env).
 */
function _formatFields(fields) {
  if (!fields || typeof fields !== "object") return "";
  const parts = [];
  if (fields.pc_id != null) parts.push(`pc_id=${fields.pc_id}`);
  if (fields.device_id != null) parts.push(`device_id=${fields.device_id}`);
  if (fields.device_serial != null) parts.push(`device_serial=${fields.device_serial}`);
  if (fields.task_device_id != null) parts.push(`task_device_id=${fields.task_device_id}`);
  if (fields.task_id != null) parts.push(`task_id=${fields.task_id}`);
  return parts.length ? parts.join(" ") + " " : "";
}

function _log(level, module, message, fields = {}) {
  const ts = new Date().toISOString();
  const extra = _formatFields(fields);
  const line = `${ts} ${level} [${module}] ${extra}${message}`;
  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else if (level === "DEBUG" && process.env.DEBUG_AGENT !== "1" && process.env.DEBUG_ORCHESTRATOR !== "1") {
    return;
  } else {
    console.log(line);
  }
}

function info(module, message, fields) {
  _log("INFO", module, message, fields);
}

function warn(module, message, fields) {
  _log("WARN", module, message, fields);
}

function error(module, message, fields) {
  _log("ERROR", module, message, fields);
}

function debug(module, message, fields) {
  _log("DEBUG", module, message, fields);
}

module.exports = { info, warn, error, debug };
