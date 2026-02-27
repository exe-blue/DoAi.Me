/**
 * Script name validation: slash-path (2+ segments) + prefix allowlist (yt, device, ops).
 * Used by POST /api/scripts and PATCH when updating name. Same rules as DB constraints.
 */
const ALLOWED_PREFIXES = ["yt", "device", "ops"] as const;
export type AllowedPrefix = (typeof ALLOWED_PREFIXES)[number];

const PATH_REGEX =
  /^[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;

export function validateScriptName(
  name: string,
): { ok: true; prefix: AllowedPrefix } | { ok: false; error: string } {
  if (typeof name !== "string" || name.trim() === "") {
    return { ok: false, error: "name is required" };
  }
  const trimmed = name.trim();

  if (!PATH_REGEX.test(trimmed)) {
    return {
      ok: false,
      error:
        'invalid name. use slash-path like "yt/preflight" with lowercase letters, digits, "_" or "-".',
    };
  }

  const prefix = trimmed.split("/")[0] as string;
  if (!ALLOWED_PREFIXES.includes(prefix as AllowedPrefix)) {
    return {
      ok: false,
      error: `invalid prefix "${prefix}". allowed prefixes: ${ALLOWED_PREFIXES.join(", ")}`,
    };
  }

  return { ok: true, prefix: prefix as AllowedPrefix };
}

export const allowedScriptPrefixes = ALLOWED_PREFIXES;
