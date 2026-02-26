/**
 * Workflow snapshot utilities: load workflow definition from DB, validate steps,
 * resolve scripts (active only), and build task_devices.config.
 * Replaces template-based config (workflow-templates.ts).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

const SCHEMA_VERSION = 1;

export type ScriptRef = { id: string; version: number };

export type WorkflowStepPayload = {
  scriptRef: ScriptRef;
  params?: Record<string, unknown>;
  waitSecAfter?: number;
  timeoutMs?: number;
};

export type WorkflowRow = {
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
  workflow: { id: string; version: number; kind: string; name: string };
  steps: WorkflowStepPayload[];
  inputs: Record<string, unknown>;
  runtime?: {
    timeouts?: { stepTimeoutSec?: number; taskTimeoutSec?: number };
  };
};

/**
 * Load workflow definition (steps) from workflows table by id and version.
 */
export async function loadWorkflowDefinition(
  workflowId: string,
  workflowVersion: number,
): Promise<WorkflowRow | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await (supabase as { from: (relation: string) => ReturnType<typeof supabase.from> })
    .from("workflows")
    .select("id, version, kind, name, is_active, steps")
    .eq("id", workflowId)
    .eq("version", workflowVersion)
    .maybeSingle()
    .returns<WorkflowRow | null>();

  if (error) throw error;
  return data;
}

/**
 * Validate that every step has scriptRef with id and version.
 */
export function validateWorkflowSteps(
  steps: unknown,
): asserts steps is WorkflowStepPayload[] {
  if (!Array.isArray(steps)) {
    throw new Error("Workflow steps must be an array");
  }
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || typeof step !== "object") {
      throw new Error(`Step ${i} must be an object`);
    }
    const ref = (step as WorkflowStepPayload).scriptRef;
    if (!ref || typeof ref !== "object") {
      throw new Error(`Step ${i} must have scriptRef`);
    }
    if (
      typeof (ref as ScriptRef).id !== "string" ||
      (ref as ScriptRef).id === ""
    ) {
      throw new Error(`Step ${i}.scriptRef.id must be a non-empty string`);
    }
    if (
      typeof (ref as ScriptRef).version !== "number" ||
      !Number.isInteger((ref as ScriptRef).version)
    ) {
      throw new Error(`Step ${i}.scriptRef.version must be an integer`);
    }
  }
}

/**
 * Resolve scripts from DB by (id, version). Throws if any script is not active.
 * Injects op.timeoutMs from scripts.timeout_ms when missing.
 * Returns steps with timeoutMs set.
 */
export async function resolveAndValidateScripts(
  steps: WorkflowStepPayload[],
): Promise<WorkflowStepPayload[]> {
  const supabase = createSupabaseServerClient();
  const resolved: WorkflowStepPayload[] = [];

  for (const step of steps) {
    const { data: script, error } = await supabase
      .from("scripts")
      .select("id, name, version, status, timeout_ms")
      .eq("id", step.scriptRef.id)
      .eq("version", step.scriptRef.version)
      .maybeSingle()
      .returns<ScriptRow | null>();

    if (error) throw error;
    if (!script) {
      throw new Error(
        `Script not found: id=${step.scriptRef.id} version=${step.scriptRef.version}`,
      );
    }
    if (script.status !== "active") {
      throw new Error(
        `Script is not active: ${script.name} (id=${script.id} version=${script.version}) status=${script.status}`,
      );
    }

    resolved.push({
      ...step,
      timeoutMs: step.timeoutMs ?? script.timeout_ms,
    });
  }

  return resolved;
}

/**
 * Build task_devices.config: schemaVersion, workflow, snapshot (createdAt + steps), inputs, runtime.timeouts.
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
      kind: workflow.kind,
      name: workflow.name,
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
 * Use this at publish/dispatch time to produce task_devices.config.
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

  validateWorkflowSteps(row.steps);
  const steps = row.steps as WorkflowStepPayload[];
  const resolvedSteps = await resolveAndValidateScripts(steps);

  return buildTaskDeviceConfig({
    workflow: {
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
