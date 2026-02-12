import * as winston from "winston";
import * as path from "path";

const { combine, timestamp, printf, colorize } = winston.format;

const jsonLine = printf(({ level, message, timestamp: ts, module: mod, ...rest }) => {
  const entry: Record<string, unknown> = {
    timestamp: ts,
    level,
    module: mod || "Agent",
    message,
  };
  if (Object.keys(rest).length > 0) {
    entry.data = rest;
  }
  return JSON.stringify(entry);
});

const consoleFormat = printf(({ level, message, timestamp: ts, module: mod, ...rest }) => {
  const data = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  return `${ts} [${level}] [${mod || "Agent"}] ${message}${data}`;
});

let rootLogger: winston.Logger | null = null;

export function initLogger(logsDir: string): winston.Logger {
  rootLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" })),
    transports: [
      new winston.transports.Console({
        format: combine(colorize(), consoleFormat),
      }),
      new winston.transports.File({
        filename: path.join(logsDir, "agent.log"),
        format: jsonLine,
        maxsize: 10 * 1024 * 1024, // 10 MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logsDir, "error.log"),
        level: "error",
        format: jsonLine,
        maxsize: 10 * 1024 * 1024,
        maxFiles: 3,
      }),
    ],
  });
  return rootLogger;
}

export function getLogger(moduleName: string): winston.Logger {
  if (!rootLogger) {
    // fallback: console-only logger before initLogger is called
    rootLogger = winston.createLogger({
      level: "info",
      format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" })),
      transports: [
        new winston.transports.Console({
          format: combine(colorize(), consoleFormat),
        }),
      ],
    });
  }
  return rootLogger.child({ module: moduleName });
}
