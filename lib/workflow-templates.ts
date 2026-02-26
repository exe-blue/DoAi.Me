/**
 * Shared workflow templates for task_devices.config.
 * schemaVersion + steps (module, waitSecAfter, params?) + video.verify + actions.policy.
 */

export const WORKFLOW_SCHEMA_VERSION = 1;

export type WorkflowStep = {
  module: string;
  waitSecAfter: number;
  params?: Record<string, unknown>;
};

export type VideoVerify = {
  titleContains?: string;
  minDurationSec?: number;
  maxDurationSec?: number;
};

export type ActionsPolicy = {
  probLike?: number;
  probComment?: number;
  probScrap?: number;
  likeTemplate?: string;
  commentTemplates?: string[];
};

export type WatchWorkflowInput = {
  videoId?: string;
  videoUrl?: string;
  title?: string;
  keyword?: string;
  durationSec?: number;
  verify?: VideoVerify;
  actions?: ActionsPolicy;
  steps?: WorkflowStep[];
};

export type MaintenanceWorkflowInput = {
  steps?: WorkflowStep[];
};

/**
 * 검색/시청/액션 템플릿 (task_devices.config.workflow)
 */
export function buildWatchWorkflowConfig(input: WatchWorkflowInput): {
  workflow: {
    schemaVersion: number;
    type: string;
    name: string;
    steps: WorkflowStep[];
  };
  video_id?: string;
  video_url?: string;
  title?: string;
  keyword?: string;
  duration_sec?: number;
  video?: { verify?: VideoVerify };
  actions?: { policy: ActionsPolicy };
} {
  const steps: WorkflowStep[] =
    input.steps ??
    [
      { module: "search_video", waitSecAfter: 10, params: { keyword: input.keyword } },
      { module: "watch_video", waitSecAfter: 60, params: { durationSec: input.durationSec ?? 60 } },
      { module: "video_actions", waitSecAfter: 30 },
    ];

  const videoUrl =
    input.videoUrl ??
    (input.videoId ? `https://www.youtube.com/watch?v=${input.videoId}` : undefined);

  const policy: ActionsPolicy = {
    probLike: 40,
    probComment: 10,
    probScrap: 5,
    likeTemplate: "👍",
    commentTemplates: ["좋아요", "유익해요"],
    ...input.actions,
  };

  return {
    workflow: {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      type: "view_farm",
      name: "default",
      steps,
    },
    ...(input.videoId && { video_id: input.videoId }),
    ...(videoUrl && { video_url: videoUrl }),
    ...(input.title && { title: input.title }),
    ...(input.keyword && { keyword: input.keyword }),
    ...(input.durationSec != null && { duration_sec: input.durationSec }),
    ...(input.verify && { video: { verify: input.verify } }),
    actions: { policy },
  };
}

/**
 * ADB 최적화/재연결 템플릿 (간단)
 */
export function buildMaintenanceWorkflowConfig(
  input: MaintenanceWorkflowInput = {},
): {
  workflow: {
    schemaVersion: number;
    type: string;
    name: string;
    steps: WorkflowStep[];
  };
} {
  const steps: WorkflowStep[] =
    input.steps ?? [
      { module: "adb_optimize", waitSecAfter: 5 },
      { module: "adb_reconnect", waitSecAfter: 10 },
    ];

  return {
    workflow: {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      type: "maintenance",
      name: "adb_optimize_reconnect",
      steps,
    },
  };
}
