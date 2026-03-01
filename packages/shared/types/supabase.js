/**
 * @doai/shared — DB/table names and type hints (pure JS).
 * Full TypeScript types stay in app (dashboard); this is for runtime/shared use.
 */

const TABLE_NAMES = [
  "workers",
  "devices",
  "accounts",
  "presets",
  "tasks",
  "task_logs",
  "task_devices",
  "proxies",
  "channels",
  "videos",
  "schedules",
  "settings",
  "command_logs",
];

module.exports = {
  TABLE_NAMES,
};
