/**
 * @doai/shared — runtime-safe helpers (no framework deps).
 */

/** Parse value to number or return default */
export function toNumberOr(value: unknown, defaultValue: number): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const n = Number(value);
  return Number.isNaN(n) ? defaultValue : n;
}

/** Narrow string to allowed status (example) */
export function isPcStatus(s: string): s is "online" | "offline" | "error" {
  return s === "online" || s === "offline" || s === "error";
}
