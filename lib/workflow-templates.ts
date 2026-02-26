/**
 * Shared workflow templates for task_devices.config.
 * Shape fixed: schemaVersion, workflow (type, name, steps), video, actions, runtime.
 * Key names must not be changed.
 */

export const WORKFLOW_SCHEMA_VERSION = 1;

export type WatchWorkflowInput = {
  title: string;
  keyword: string;
  expectedTitleContains?: string[];
  minWatchSec?: number;
  maxWatchSec?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  probLike?: number;
  probComment?: number;
  probScrap?: number;
  commentTemplates?: string[];
  seed?: string | null;
  /** Optional: when creating from video record */
  videoId?: string | null;
  channelId?: string | null;
};

/**
 * MAIN(시청) — 검색/시청/액션. Shape fixed (키 이름 변경 금지).
 */
export function buildWatchWorkflowConfig(input: WatchWorkflowInput) {
  return {
    schemaVersion: 1,
    workflow: {
      type: "MAIN",
      name: "WATCH_BY_TITLE_V1",
      steps: [
        { module: "yt_preflight", waitSecAfter: 1, params: {} },
        {
          module: "yt_search_video",
          waitSecAfter: 2,
          params: { mode: "title" },
        },
        {
          module: "yt_watch_video",
          waitSecAfter: 1,
          params: {
            minWatchSec: input.minWatchSec ?? 240,
            maxWatchSec: input.maxWatchSec ?? 420,
          },
        },
        {
          module: "yt_actions",
          waitSecAfter: 0,
          params: { like: true, comment: true, scrap: true },
        },
      ],
    },
    video: {
      videoId: input.videoId ?? null,
      title: input.title ?? "",
      keyword: input.keyword ?? "",
      channelId: input.channelId ?? null,
      verify: {
        expectedTitleContains: input.expectedTitleContains ?? [],
        minDurationSec: input.minDurationSec ?? 30,
        maxDurationSec: input.maxDurationSec ?? 7200,
      },
    },
    actions: {
      policy: {
        probLike: input.probLike ?? 0.3,
        probComment: input.probComment ?? 0.05,
        probScrap: input.probScrap ?? 0.1,
        commentTemplates: input.commentTemplates ?? [
          "좋네요",
          "재밌게 봤습니다",
          "영상 잘 보고 갑니다",
        ],
      },
      seed: input.seed ?? null,
    },
    runtime: {
      attempt: 0,
      timeouts: {
        stepTimeoutSec: 180,
        taskTimeoutSec: 900,
      },
    },
  } as const;
}

/**
 * MAINTENANCE(유지보수) — adb 최적화/재연결. Shape fixed.
 */
export function buildMaintenanceWorkflowConfig(profile: string = "default") {
  return {
    schemaVersion: 1,
    workflow: {
      type: "MAINTENANCE",
      name: "DEVICE_OPTIMIZE_V1",
      steps: [
        { module: "adb_restart", waitSecAfter: 2, params: {} },
        { module: "adb_optimize", waitSecAfter: 1, params: { profile } },
      ],
    },
    runtime: {
      attempt: 0,
      timeouts: {
        stepTimeoutSec: 60,
        taskTimeoutSec: 240,
      },
    },
  } as const;
}
