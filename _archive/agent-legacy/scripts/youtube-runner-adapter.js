/**
 * Task-devices runner ↔ agent/youtube 모듈 어댑터.
 * Xiaowei + deviceTarget(connection_id|serial) → ADBDevice → yt_preflight, yt_search_video, yt_watch_video, yt_actions 실행.
 */
const { ADBDevice } = require("./adb/client");
const { getLogger } = require("./common/logger");
const { preflightCheck } = require("./youtube/preflight");
const { searchAndSelect } = require("./youtube/search");
const {
  handlePrerollAds,
  ensurePlaying,
  watchVideo,
} = require("./youtube/watch");
const { likeVideo, writeComment, saveToPlaylist } = require("./youtube/action");

const log = getLogger("youtube-runner-adapter");

/**
 * deviceTarget(connection_id 또는 serial) + xiaowei로 ADBDevice 생성.
 * @param {import('./xiaowei-client')} xiaowei
 * @param {string} deviceTarget
 * @returns {import('./adb/client').ADBDevice}
 */
function createDev(xiaowei, deviceTarget) {
  return new ADBDevice(xiaowei, deviceTarget);
}

/**
 * workflow step 한 건 실행 (yt_* / adb_* 모듈 디스패치).
 * @param {string} deviceTarget - connection_id 또는 serial
 * @param {import('./xiaowei-client')} xiaowei
 * @param {object} step - { module, waitSecAfter, params }
 * @param {object} config - task_device.config (workflow, video, actions, runtime)
 * @returns {Promise<void>}
 */
async function runYoutubeStep(deviceTarget, xiaowei, step, config) {
  const dev = createDev(xiaowei, deviceTarget);
  const module = step.module || "";
  const params = step.params || {};

  if (module === "yt_preflight") {
    const result = await preflightCheck(dev);
    if (!result.passed) {
      log.warn("yt_preflight failed", {
        deviceTarget: deviceTarget.substring(0, 8),
        missing: result.missing,
      });
      throw new Error(`Preflight failed: ${(result.missing || []).join(", ")}`);
    }
    return;
  }

  if (module === "yt_search_video") {
    const keyword =
      config.video?.keyword ?? config.keyword ?? params.keyword ?? "";
    const result = await searchAndSelect(dev, keyword);
    if (!result.selected) {
      log.warn("yt_search_video no selection", {
        deviceTarget: deviceTarget.substring(0, 8),
        keyword,
      });
    }
    return;
  }

  if (module === "yt_watch_video") {
    const minSec = params.minWatchSec ?? 240;
    const maxSec = params.maxWatchSec ?? 420;
    const durationSec =
      Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
    await handlePrerollAds(dev);
    await ensurePlaying(dev);
    await watchVideo(dev, durationSec);
    return;
  }

  if (module === "yt_actions") {
    const policy = config.actions?.policy ?? {};
    const probLike = policy.probLike ?? 0.3;
    const probComment = policy.probComment ?? 0.05;
    const probScrap = policy.probScrap ?? 0.1;
    const templates = policy.commentTemplates ?? ["좋네요", "재밌게 봤습니다"];

    if (Math.random() < probLike) {
      try {
        await likeVideo(dev);
      } catch (e) {
        log.warn("yt_actions like failed", { err: e.message });
      }
    }
    if (Math.random() < probComment) {
      try {
        const text = templates[Math.floor(Math.random() * templates.length)];
        await writeComment(dev, text);
      } catch (e) {
        log.warn("yt_actions comment failed", { err: e.message });
      }
    }
    if (Math.random() < probScrap) {
      try {
        await saveToPlaylist(dev);
      } catch (e) {
        log.warn("yt_actions scrap failed", { err: e.message });
      }
    }
    return;
  }

  if (module === "adb_restart" || module === "adb_optimize") {
    if (module === "adb_restart") {
      await dev.closeYouTube();
      await dev.shell("am force-stop com.google.android.youtube");
    }
    if (module === "adb_optimize") {
      await dev.optimize();
    }
    return;
  }

  log.warn("youtube-runner-adapter: unknown module", { module });
}

module.exports = { createDev, runYoutubeStep };
