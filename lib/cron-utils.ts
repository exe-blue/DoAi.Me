import { CronExpressionParser } from "cron-parser";

/**
 * Compute the next run time from a cron expression.
 * @param cronExpr Standard 5-field cron expression
 * @returns ISO timestamp string of next occurrence
 */
export function computeNextRun(cronExpr: string): string {
  const interval = CronExpressionParser.parse(cronExpr, { tz: "UTC" });
  const next = interval.next();
  return next.toISOString() ?? new Date().toISOString();
}

/**
 * Validate a cron expression.
 * @param cronExpr Standard 5-field cron expression
 * @returns { valid: boolean, error?: string }
 */
export function validateCron(cronExpr: string): { valid: boolean; error?: string } {
  try {
    CronExpressionParser.parse(cronExpr);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Invalid cron expression" };
  }
}

/**
 * Convert a cron expression to human-readable Korean text.
 * Covers common patterns; falls back to raw expression for complex ones.
 */
export function cronToHumanReadable(cronExpr: string): string {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return cronExpr;

  const [minute, hour, dom, month, dow] = parts;

  // Every N minutes: "*/N * * * *"
  if (minute.startsWith("*/") && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    const n = parseInt(minute.slice(2), 10);
    if (n === 1) return "매 1분마다";
    return `매 ${n}분마다`;
  }

  // Every N hours at :00: "0 */N * * *"
  if (minute === "0" && hour.startsWith("*/") && dom === "*" && month === "*" && dow === "*") {
    const n = parseInt(hour.slice(2), 10);
    if (n === 1) return "매 1시간마다";
    return `매 ${n}시간마다`;
  }

  // Specific minute every hour: "M * * * *"
  if (/^\d+$/.test(minute) && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `매시 ${minute}분`;
  }

  // Daily at specific time: "M H * * *"
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dom === "*" && month === "*" && dow === "*") {
    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    const period = h < 12 ? "오전" : "오후";
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const displayM = m === 0 ? "" : ` ${m}분`;
    return `매일 ${period} ${displayH}시${displayM}`;
  }

  // Range hours: "0 9-18 * * *" or "*/30 9-18 * * *"
  if (dom === "*" && month === "*" && dow === "*" && hour.includes("-")) {
    const [startH, endH] = hour.split("-").map(Number);
    if (minute === "0") {
      return `매일 ${startH}시~${endH}시 매시간`;
    }
    if (minute.startsWith("*/")) {
      const n = parseInt(minute.slice(2), 10);
      return `매일 ${startH}시~${endH}시 ${n}분마다`;
    }
  }

  // Specific days of week: "M H * * 1-5"
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dom === "*" && month === "*") {
    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    const timeStr = `${h}시${m > 0 ? ` ${m}분` : ""}`;

    if (dow === "1-5") return `평일 ${timeStr}`;
    if (dow === "0,6") return `주말 ${timeStr}`;
  }

  return cronExpr;
}
