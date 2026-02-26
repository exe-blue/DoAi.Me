/**
 * Workflow snapshot: load from workflows_definitions, validate steps (step.ops[]),
 * resolve scripts (active + timeoutMs), build task_devices.config (schemaVersion 4).
 * Replaces template-based config (workflow-templates.ts).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

const SCHEMA_VERSION = 4;

export type ScriptRef = { scriptId: string; version: number };

export type WorkflowOp = {
  type: "javascript";
  scriptRef: ScriptRef;
  params?: Record<string, unknown>;
  timeoutMs?: number;
};

export type WorkflowStep = {
  ops: WorkflowOp[];
};

export type WorkflowDefRow = {
  id: string;
  version: number;
  kind: string;
  name: string;
  is_active: boolean;
  steps: unknown;
};

export type ScriptRow = {
  id: string;
  name: string;
  version: number;
  status: string;
  timeout_ms: number;
};

export type TaskDeviceConfigInput = {
  workflowDef: { id: string; version: number; kind: string; name: string };
  steps: WorkflowStep[];
  inputs: Record<string, unknown>;
  runtime?: {
    timeouts?: { stepTimeoutSec?: number; taskTimeoutSec?: number };
  };
};

/**
 * Load workflow definition from workflows_definitions by id and version.
 */
export async function loadWorkflowDefinition(
  workflowId: string,
  workflowVersion: number,
): Promise<WorkflowDefRow | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await (supabase as { from: (relation: string) => ReturnType<typeof supabase.from> })
    .from("workflows_definitions")
    .select("id, version, kind, name, is_active, steps")
    .eq("id", workflowId)
    .eq("version", workflowVersion)
    .maybeSingle()
    .returns<WorkflowDefRow | null>();

  if (error) throw error;
  return data;
}

/**
 * Validate steps shape: steps is array, each step.ops is array,
 * each op is { type:'javascript', scriptRef:{ scriptId, version }, params? }.
 */
export function validateStepsShape(steps: unknown): asserts steps is WorkflowStep[] {
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
      const ref = (op as WorkflowOp).scriptRef;
      if (!ref || typeof ref !== "object") {
        throw new Error(`Step ${i}.ops[${j}] must have scriptRef`);
      }
      const scriptId = (ref as ScriptRef).scriptId;
      const version = (ref as ScriptRef).version;
      if (typeof scriptId !== "string" || scriptId === "") {
        throw new Error(`Step ${i}.ops[${j}].scriptRef.scriptId must be a non-empty string`);
      }
      if (typeof version !== "number" || !Number.isInteger(version)) {
        throw new Error(`Step ${i}.ops[${j}].scriptRef.version must be an integer`);
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
      const { data: script, error } = await (supabase as { from: (relation: string) => ReturnType<typeof supabase.from> })
        .from("scripts")
        .select("id, name, version, status, timeout_ms")
        .eq("id", op.scriptRef.scriptId)
        .eq("version", op.scriptRef.version)
        .maybeSingle()
        .returns<ScriptRow | null>();

      if (error) throw error;
      if (!script) {
        throw new Error(
          `Script not found: scriptId=${op.scriptRef.scriptId} version=${op.scriptRef.version}`,
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
 * Build task_devices.config: schemaVersion=4, workflow{}, snapshot{createdAt, steps}, inputs{}, runtime.timeouts{}.
 */
export function buildTaskDeviceConfig(
  options: TaskDeviceConfigInput,
): Record<string, unknown> {
  const { workflowDef, steps, inputs, runtime = {} } = options;

  const stepTimeoutSec = runtime.timeouts?.stepTimeoutSec ?? 180;
  const taskTimeoutSec = runtime.timeouts?.taskTimeoutSec ?? 900;

  return {
    schemaVersion: SCHEMA_VERSION,
    workflow: {
      id: workflowDef.id,
      version: workflowDef.version,
      kind: workflowDef.kind,
      name: workflowDef.name,
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
 * Load workflow, validate steps, resolve scripts, and build config in one call.
 * Use at publish/dispatch time to produce task_devices.config.
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
    workflowDef: {
      id: row.id,
      version: row.version,
      kind: row.kind,
      name: row.name,
    },
    steps: resolvedSteps,
    inputs,
    runtime,
  });
}
