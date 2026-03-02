/**
 * workflows.steps JSON 스키마 고정안 — API/편집기 저장 시·발행 시 재검증 공용.
 * op는 무조건 scriptRef(scriptId+version) 고정, background step 최대 1개, params는 object만, timeoutMs 없으면 발행 시 scripts.timeout_ms 주입.
 */
export type ScriptRef = { scriptId: string; version: number };

export type WorkflowOp = {
  type: "javascript" | "adb_shell";
  scriptRef: ScriptRef;
  params?: Record<string, unknown>;
  timeoutMs?: number;
};

export type WorkflowStep = {
  id: string;
  lane: "foreground" | "background";
  waitSecBefore?: number;
  waitSecAfter?: number;
  continueOnError?: boolean;
  ops: WorkflowOp[];
};

export type ValidateResult =
  | { ok: true }
  | { ok: false; error: string; path?: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isNonNegNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

export function validateWorkflowSteps(steps: unknown): ValidateResult {
  if (!Array.isArray(steps)) {
    return { ok: false, error: "steps must be an array", path: "steps" };
  }
  if (steps.length === 0) {
    return { ok: false, error: "steps must not be empty", path: "steps" };
  }

  let backgroundCount = 0;
  const stepIds = new Set<string>();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] as Record<string, unknown>;
    const stepPath = `steps[${i}]`;

    if (!isPlainObject(step)) {
      return { ok: false, error: "step must be an object", path: stepPath };
    }

    if (typeof step.id !== "string" || (step.id as string).trim() === "") {
      return {
        ok: false,
        error: "step.id must be a non-empty string",
        path: `${stepPath}.id`,
      };
    }
    if (stepIds.has(step.id as string)) {
      return {
        ok: false,
        error: `duplicate step.id: ${step.id}`,
        path: `${stepPath}.id`,
      };
    }
    stepIds.add(step.id as string);

    if (step.lane !== "foreground" && step.lane !== "background") {
      return {
        ok: false,
        error: 'step.lane must be "foreground" or "background"',
        path: `${stepPath}.lane`,
      };
    }
    if (step.lane === "background") backgroundCount++;

    if (
      step.waitSecBefore !== undefined &&
      !isNonNegNumber(step.waitSecBefore)
    ) {
      return {
        ok: false,
        error: "waitSecBefore must be >= 0",
        path: `${stepPath}.waitSecBefore`,
      };
    }
    if (
      step.waitSecAfter !== undefined &&
      !isNonNegNumber(step.waitSecAfter)
    ) {
      return {
        ok: false,
        error: "waitSecAfter must be >= 0",
        path: `${stepPath}.waitSecAfter`,
      };
    }
    if (
      step.continueOnError !== undefined &&
      typeof step.continueOnError !== "boolean"
    ) {
      return {
        ok: false,
        error: "continueOnError must be boolean",
        path: `${stepPath}.continueOnError`,
      };
    }

    if (!Array.isArray(step.ops) || step.ops.length === 0) {
      return {
        ok: false,
        error: "step.ops must be a non-empty array",
        path: `${stepPath}.ops`,
      };
    }

    for (let j = 0; j < step.ops.length; j++) {
      const op = step.ops[j] as Record<string, unknown>;
      const opPath = `${stepPath}.ops[${j}]`;

      if (!isPlainObject(op)) {
        return { ok: false, error: "op must be an object", path: opPath };
      }
      if (op.type !== "javascript" && op.type !== "adb_shell") {
        return {
          ok: false,
          error: 'op.type must be "javascript" or "adb_shell"',
          path: `${opPath}.type`,
        };
      }

      if (!isPlainObject(op.scriptRef)) {
        return {
          ok: false,
          error: "op.scriptRef must be an object",
          path: `${opPath}.scriptRef`,
        };
      }
      const ref = op.scriptRef as Record<string, unknown>;
      if (
        typeof ref.scriptId !== "string" ||
        (ref.scriptId as string).trim() === ""
      ) {
        return {
          ok: false,
          error: "scriptRef.scriptId must be non-empty string",
          path: `${opPath}.scriptRef.scriptId`,
        };
      }
      if (
        typeof ref.version !== "number" ||
        !Number.isInteger(ref.version) ||
        (ref.version as number) <= 0
      ) {
        return {
          ok: false,
          error: "scriptRef.version must be integer > 0",
          path: `${opPath}.scriptRef.version`,
        };
      }

      if (op.params !== undefined && !isPlainObject(op.params)) {
        return {
          ok: false,
          error: "op.params must be an object",
          path: `${opPath}.params`,
        };
      }
      if (
        op.timeoutMs !== undefined &&
        (!isNonNegNumber(op.timeoutMs) || (op.timeoutMs as number) === 0)
      ) {
        return {
          ok: false,
          error: "op.timeoutMs must be > 0",
          path: `${opPath}.timeoutMs`,
        };
      }
    }
  }

  if (backgroundCount > 1) {
    return {
      ok: false,
      error: "only one background step is allowed (initial policy)",
      path: "steps",
    };
  }

  return { ok: true };
}
