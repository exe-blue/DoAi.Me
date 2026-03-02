/**
 * Workflow snapshot: load from workflows, validate steps (step.ops[]),
 * resolve scripts (active + timeoutMs), build task_devices.config (schemaVersion 4).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SCHEMA_VERSION = 4;

export type ScriptRef = { scriptId: string; version: number; id?: string };

export type WorkflowOp = {
  type: "javascript";
  scriptRef: ScriptRef;
  params?: Record<string, unknown>;
  timeoutMs?: number;
};

export type WorkflowStep = {
  ops: WorkflowOp[];
};

export type WorkflowRow = {
  id: string;
  version: number;
  name: string;
  steps: unknown;
  is_active: boolean;
  kind?: string;
};

export type ScriptRow = {
  id: string;
  name: string;
  version: number;
  status: string;
  timeout_ms: number;
};

type ScriptQueryResult = Promise<{ data: ScriptRow | null; error: unknown }>;
type WorkflowQueryResult = { data: WorkflowRow | null; error: unknown };
type WorkflowQueryPromise = Promise<WorkflowQueryResult>;

export type TaskDeviceConfigInput = {
  workflow: { id: string; version: number; name: string; kind?: string };
  steps: WorkflowStep[];
  inputs: Record<string, unknown>;
  runtime?: {
    timeouts?: { stepTimeoutSec?: number; taskTimeoutSec?: number };
  };
};

const workflowsFrom = (supabase: ReturnType<typeof createSupabaseServerClient>) =>
  (supabase as { from: (relation: string) => ReturnType<typeof supabase.from> })
    .from("workflows");

/**
 * Load workflow by id (single row). Uses workflows table.
 */
export async function loadWorkflow(
  workflowId: string,
): Promise<WorkflowRow | null> {
  const supabase = createSupabaseServerClient();
  // Cast to avoid deep Supabase type instantiation
  const result = await (workflowsFrom(supabase) as unknown as { select: (_s: string) => { eq: (_a: string, _b: string) => { maybeSingle: () => WorkflowQueryPromise } } }).select("id, version, name, steps, is_active, kind").eq("id", workflowId).maybeSingle();
  const { data, error } = result;

  if (error) throw error;
  return data;
}

/**
 * Load workflow by id and version. Uses workflows table.
 */
export async function loadWorkflowDefinition(
  workflowId: string,
  workflowVersion: number,
): Promise<WorkflowRow | null> {
  const supabase = createSupabaseServerClient();
  // Cast to avoid deep Supabase type instantiation
  const result = await (workflowsFrom(supabase) as unknown as { select: (_s: string) => { eq: (_a: string, _b: string) => { eq: (_a2: string, _b2: number) => { maybeSingle: () => WorkflowQueryPromise } } } }).select("id, version, name, steps, is_active, kind").eq("id", workflowId).eq("version", workflowVersion).maybeSingle();
  const { data, error } = result;

  if (error) throw error;
  return data;
}

/**
 * Validate steps shape: steps is array, each step.ops is array,
 * each op is { type:'javascript', scriptRef:{ scriptId, version }, params?, timeoutMs? }.
 */
export function validateStepsShape(
  steps: unknown,
): asserts steps is WorkflowStep[] {
  if (!Array.isArray(steps)) {
    throw new Error("Workflow steps must be an array");
  }
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || typeof step !== "object") {
      throw new Error(`Step ${i} must be an object`);
    }
    if (!Array.isArray((step as WorkflowStep).ops)) {
      throw new Error(`Step ${i}.ops must be an array`);
    }
    const ops = (step as WorkflowStep).ops;
    for (let j = 0; j < ops.length; j++) {
      const op = ops[j];
      if (!op || typeof op !== "object") {
        throw new Error(`Step ${i}.ops[${j}] must be an object`);
      }
      if ((op as WorkflowOp).type !== "javascript") {
        throw new Error(`Step ${i}.ops[${j}].type must be 'javascript'`);
      }
      const ref = (op as WorkflowOp).scriptRef as ScriptRef;
      if (!ref || typeof ref !== "object") {
        throw new Error(`Step ${i}.ops[${j}] must have scriptRef`);
      }
      const scriptId =
        typeof ref.scriptId === "string" && ref.scriptId !== ""
          ? ref.scriptId
          : typeof ref.id === "string" && ref.id !== ""
            ? ref.id
            : null;
      if (scriptId === null) {
        throw new Error(
          `Step ${i}.ops[${j}].scriptRef must have scriptId or id (non-empty string)`,
        );
      }
      if (typeof ref.version !== "number" || !Number.isInteger(ref.version)) {
        throw new Error(
          `Step ${i}.ops[${j}].scriptRef.version must be an integer`,
        );
      }
    }
  }
}

/**
 * Resolve all ops from steps: lookup scripts by (id, version), require status === 'active',
 * inject op.timeoutMs from scripts.timeout_ms when missing. Returns steps with timeoutMs set on each op.
 */
export async function resolveAndValidateScripts(
  steps: WorkflowStep[],
): Promise<WorkflowStep[]> {
  const supabase = createSupabaseServerClient();
  const resolved: WorkflowStep[] = [];

  for (const step of steps) {
    const resolvedOps: WorkflowOp[] = [];
    for (const op of step.ops) {
      const ref = op.scriptRef as ScriptRef;
      const scriptId =
        (typeof ref.scriptId === "string" && ref.scriptId ? ref.scriptId : null) ??
        (typeof ref.id === "string" && ref.id ? ref.id : null);
      if (!scriptId) {
        throw new Error("scriptRef.id or scriptRef.scriptId is required");
      }
      // scripts table not in generated DB types yet; use type assertion for query
      const sb = supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (a: string, b: string) => {
              eq: (a2: string, b2: number) => { maybeSingle: () => ScriptQueryResult };
            };
          };
        };
      };
      const scriptResult = await sb
        .from("scripts")
        .select("id, name, version, status, timeout_ms")
        .eq("id", scriptId)
        .eq("version", ref.version)
        .maybeSingle();
      const { data: script, error } = scriptResult;

      if (error) throw error;
      if (!script) {
        throw new Error(
          `Script not found: id=${scriptId} version=${ref.version}`,
        );
      }
      if (script.status !== "active") {
        throw new Error(
          `Script is not active: ${script.name} (id=${script.id} version=${script.version}) status=${script.status}`,
        );
      }

      resolvedOps.push({
        ...op,
        timeoutMs: op.timeoutMs ?? script.timeout_ms,
      });
    }
    resolved.push({ ops: resolvedOps });
  }

  return resolved;
}

/**
 * Build task_devices.config: schemaVersion=4, workflow{id,version,name,kind?}, snapshot{createdAt,steps}, inputs, runtime.timeouts.
 */
export function buildTaskDeviceConfig(
  options: TaskDeviceConfigInput,
): Record<string, unknown> {
  const { workflow, steps, inputs, runtime = {} } = options;

  const stepTimeoutSec = runtime.timeouts?.stepTimeoutSec ?? 180;
  const taskTimeoutSec = runtime.timeouts?.taskTimeoutSec ?? 900;

  return {
    schemaVersion: SCHEMA_VERSION,
    workflow: {
      id: workflow.id,
      version: workflow.version,
      name: workflow.name,
      ...(workflow.kind != null ? { kind: workflow.kind } : {}),
    },
    snapshot: {
      createdAt: new Date().toISOString(),
      steps,
    },
    inputs,
    runtime: {
      timeouts: {
        stepTimeoutSec,
        taskTimeoutSec,
      },
    },
  } as Record<string, unknown>;
}

/** Default workflow for watch/view_farm tasks. */
export const DEFAULT_WATCH_WORKFLOW_ID = "WATCH_MAIN";
export const DEFAULT_WATCH_WORKFLOW_VERSION = 1;

/**
 * Load workflow (by id+version), validate steps, resolve scripts (status=active), and build config.
 * Use at publish/dispatch; scripts not active will throw here.
 */
export async function buildConfigFromWorkflow(
  workflowId: string,
  workflowVersion: number,
  inputs: Record<string, unknown>,
  runtime?: { timeouts?: { stepTimeoutSec?: number; taskTimeoutSec?: number } },
): Promise<Record<string, unknown>> {
  const row = await loadWorkflowDefinition(workflowId, workflowVersion);
  if (!row) {
    throw new Error(`Workflow not found: ${workflowId}@${workflowVersion}`);
  }
  if (!row.is_active) {
    throw new Error(`Workflow is not active: ${workflowId}@${workflowVersion}`);
  }

  validateStepsShape(row.steps);
  const steps = row.steps as WorkflowStep[];
  const resolvedSteps = await resolveAndValidateScripts(steps);

  return buildTaskDeviceConfig({
    workflow: {
      id: row.id,
      version: row.version,
      name: row.name,
      kind: row.kind,
    },
    steps: resolvedSteps,
    inputs,
    runtime,
  });
}
