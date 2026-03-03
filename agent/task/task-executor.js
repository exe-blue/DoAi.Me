/**
 * DoAi.Me - Task Execution Engine
 * Maps Supabase tasks to Xiaowei WebSocket commands
 */
const path = require("path");
const CommentGenerator = require("../setup/comment-generator");
const sleep = require("../lib/sleep");
const { extractDeviceOutput, summarizeResponse } = require("../lib/xiaowei-response");

function _escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Random int [min, max] inclusive */
function _randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function _isRetryableNetworkError(err) {
  const message = String(err?.message || err || "").toLowerCase();
  return /(timeout|timed out|econn|epipe|network|socket|websocket|disconnected|etimedout|enotfound)/.test(message);
}

function _normalizeRetrySnapshot(result) {
  return {
    code: result && result.code !== undefined ? result.code : undefined,
    msg: result && result.msg != null ? String(result.msg) : "",
    output: _extractShellOutput(result),
  };
}

function expectNonEmptyOutput(result) {
  return _extractShellOutput(result).trim().length > 0;
}

/**
 * Layer 3: run async fn up to maxAttempts times with Xiaowei-aware retry policy.
 * Retryable: network/timeout errors, queued=true, code!==10000, validator failure.
 */
async function _withRetry(fn, { maxAttempts = 3, serial = "", command = "", validator = null } = {}) {
  let lastError = null;
  let lastSnapshot = { code: undefined, msg: "", output: "" };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      lastSnapshot = _normalizeRetrySnapshot(result);

      const isQueued = result && result.queued === true;
      const hasCode = result && result.code !== undefined;
      const codeFailed = hasCode && Number(result.code) !== 10000;
      const validatorFailed = typeof validator === "function" && !validator(result);

      if (!isQueued && !codeFailed && !validatorFailed) {
        return result;
      }

      lastError = new Error(
        isQueued
          ? "queued response"
          : codeFailed
            ? `unexpected code=${result.code}`
            : "validator failed"
      );
    } catch (err) {
      if (!_isRetryableNetworkError(err)) {
        throw err;
      }
      lastError = err;
      lastSnapshot = {
        code: undefined,
        msg: err?.message ? String(err.message) : "",
        output: "",
      };
    }

    if (attempt < maxAttempts) {
      const base = lastSnapshot.msg === "queued response" ? 200 : 500;
      await sleep(base * attempt);
    }
  }

  const fail = new Error(
    `Retry exceeded serial=${serial} command=${JSON.stringify(command)} ` +
      `last_code=${lastSnapshot.code ?? "n/a"} last_msg=${JSON.stringify(lastSnapshot.msg || "")} ` +
      `last_output=${JSON.stringify((lastSnapshot.output || "").substring(0, 300))}`
  );
  if (lastError) fail.cause = lastError;
  throw fail;
}

/** YouTube UI 요소 (resource-id / content-desc). docs/youtube-ui-objects.md 참고. */
const YT = {
  SEARCH_BUTTON: { resourceId: "com.google.android.youtube:id/menu_item_1" },
  SEARCH_BUTTON_ALT: { contentDesc: "검색" },
  SEARCH_EDIT_TEXT: { resourceId: "com.google.android.youtube:id/search_edit_text" },
  SEARCH_EDIT_ALT: { className: "android.widget.EditText" },
  SKIP_AD: { resourceId: "com.google.android.youtube:id/skip_ad_button" },
  SKIP_AD_ALT: { contentDesc: "건너뛰기" },
  PLAY_PAUSE: { resourceId: "com.google.android.youtube:id/player_control_play_pause_replay_button" },
  PLAY_PAUSE_ALT: { contentDesc: "재생" },
  PAUSE_ALT: { contentDesc: "일시중지" },
  PLAYER: { resourceId: "com.google.android.youtube:id/player_fragment_container" },
  VIDEO_TITLE: { resourceId: "com.google.android.youtube:id/video_title" },
  LIKE_BUTTON: { resourceId: "com.google.android.youtube:id/like_button" },
  SUBSCRIBE_BUTTON: { resourceId: "com.google.android.youtube:id/subscribe_button" },
  SUBSCRIBE_TEXT: { textContains: "구독 중" },
  COMMENT_INPUT: { resourceId: "com.google.android.youtube:id/comment_composer_input" },
  COMMENT_INPUT_ALT: { contentDesc: "댓글 추가..." },
  COMMENT_POST: { resourceId: "com.google.android.youtube:id/comment_post_button" },
  COMMENT_POST_ALT: { contentDesc: "댓글" },
  SAVE_PLAYLIST: { resourceId: "com.google.android.youtube:id/save_to_playlist_button" },
  SAVE_PLAYLIST_ALT: { contentDesc: "재생목록에 저장" },
  WATCH_LATER: { textContains: "나중에 볼 동영상" },
  SAVE_ADD: { textContains: "담기" },
  SAVE_ADD_ALT: { contentDesc: "담기" },
  HOME_FEED: { resourceId: "com.google.android.youtube:id/results" },
  RELATED_VIDEO: { resourceId: "com.google.android.youtube:id/thumbnail" },
  AUTOPLAY_TOGGLE: { resourceId: "com.google.android.youtube:id/autonav_toggle" },
  BOTTOM_NAV_HOME: { contentDesc: "홈" },
  BOTTOM_NAV_SHORTS: { contentDesc: "Shorts" },
  BOTTOM_NAV_SUBS: { contentDesc: "구독" },
};

// === Engagement 상수 (agent/docs/engagement-system-design.md) ===
const PERSONALITY_TYPES = {
  passive: { likeMult: 0.3, commentMult: 0.0, subscribeMult: 0.2, playlistMult: 0.1 },
  casual: { likeMult: 0.7, commentMult: 0.3, subscribeMult: 0.5, playlistMult: 0.3 },
  active: { likeMult: 1.5, commentMult: 1.0, subscribeMult: 1.2, playlistMult: 1.0 },
  superfan: { likeMult: 2.0, commentMult: 2.0, subscribeMult: 2.0, playlistMult: 2.0 },
};
const PERSONALITY_DISTRIBUTION = [
  { type: "passive", weight: 30 },
  { type: "casual", weight: 40 },
  { type: "active", weight: 20 },
  { type: "superfan", weight: 10 },
];
const TIME_WEIGHT = {
  0: 0.3, 1: 0.2, 2: 0.1, 3: 0.1, 4: 0.2, 5: 0.3,
  6: 0.5, 7: 0.7, 8: 0.8,
  9: 0.9, 10: 1.0, 11: 1.0, 12: 1.1, 13: 1.0, 14: 0.9, 15: 0.9, 16: 1.0,
  17: 1.1, 18: 1.2, 19: 1.3, 20: 1.3, 21: 1.2,
  22: 1.0, 23: 0.7,
};
const DEFAULT_PROBS = { like: 15, comment: 5, subscribe: 8, playlist: 3 };

class TaskExecutor {
  /**
   * @param {import('./xiaowei-client')} xiaowei
   * @param {import('./supabase-sync')} supabaseSync
   * @param {object} config
   */
  constructor(xiaowei, supabaseSync, config) {
    this.xiaowei = xiaowei;
    this.supabaseSync = supabaseSync;
    this.config = config;
    this.running = new Set();
    this.maxConcurrent = 20;

    // Job assignment polling (pending → run YouTube watch → completed)
    this._jobPollHandle = null;
    this._jobRunning = new Set(); // assignment id
    this._jobPollIntervalMs = 15000;
    this._maxConcurrentJobs = 5;

    // Execution stats for monitoring
    this.stats = { total: 0, succeeded: 0, failed: 0 };

    // 디바이스별 성격 캐시 (serial → personality type)
    this._devicePersonalities = new Map();

    this.commentGenerator = null;
    if (process.env.OPENAI_API_KEY) {
      this.commentGenerator = new CommentGenerator(
        process.env.OPENAI_API_KEY,
        process.env.OPENAI_MODEL || "gpt-4o-mini"
      );
      console.log("[TaskExecutor] ✓ CommentGenerator initialized (OpenAI)");
    } else {
      console.log("[TaskExecutor] ⚠ OPENAI_API_KEY not set — comments disabled");
    }

    this._warmupTracker = new Map();
  }

  /**
   * Execute a single task_device row (called by DeviceOrchestrator).
   * Layer 3: config may include title, keyword, min/max wait, watch %, probs, comment_content.
   * @param {object} taskDevice - { id, task_id, device_serial, config: { video_url, video_id, title?, keyword?, ... }, worker_id }
   */
  async runTaskDevice(taskDevice) {
    if (!taskDevice?.id) throw new Error("runTaskDevice: missing id");
    const serial = taskDevice.device_serial;
    if (!serial) {
      await this._updateTaskDevice(taskDevice.id, "failed", { error: "No device_serial" });
      return;
    }
    const cfg = taskDevice.config || {};
    const videoUrl = cfg.video_url;
    const videoId = cfg.video_id || "";
    if (!videoUrl) {
      await this._updateTaskDevice(taskDevice.id, "failed", { error: "No video_url in config" });
      return;
    }
    const searchKeyword = cfg.keyword ?? cfg.title ?? null;
    const videoTitle = cfg.title ?? null;
    const waitMinSec = Math.max(0, Number(cfg.min_wait_sec) || 1);
    const waitMaxSec = Math.max(waitMinSec, Number(cfg.max_wait_sec) || 5);
    const durationSec = this._resolveWatchDurationSec(cfg);

    // Phase 1: comment_status ready → use pre-generated; pending → agent fallback (generate + set fallback)
    let commentContent = null;
    const commentStatus = taskDevice.comment_status ?? cfg.comment_status ?? "pending";
    if (commentStatus === "ready" && (cfg.comment_content || taskDevice.comment_content)) {
      commentContent = cfg.comment_content ?? taskDevice.comment_content;
    } else if (commentStatus === "pending" && this.commentGenerator) {
      try {
        commentContent = await this.commentGenerator.generate(videoTitle || "", "");
        await this.supabaseSync.supabase
          .from("task_devices")
          .update({ comment_status: "fallback" })
          .eq("id", taskDevice.id);
      } catch (e) {
        console.warn("[TaskExecutor] Comment fallback generate failed:", e.message);
      }
    }

    const engagementConfig = {
      probLike: Number(cfg.prob_like) || DEFAULT_PROBS.like,
      probComment: Number(cfg.prob_comment) || DEFAULT_PROBS.comment,
      probSubscribe: DEFAULT_PROBS.subscribe,
      probPlaylist: Number(cfg.prob_playlist) || DEFAULT_PROBS.playlist,
      channelName: "",
      videoId,
      warmupSec: this._shouldWarmup(serial) ? _randInt(60, 180) : 0,
      waitMinSec,
      waitMaxSec,
      commentContent,
      actionTouchCoords: cfg.action_touch_coords ?? null,
    };
    this._jobRunning.add(taskDevice.id);

    this.supabaseSync.insertExecutionLog(
      taskDevice.id,
      serial,
      "run_task_device_start",
      { task_id: taskDevice.task_id, video_id: videoId },
      null,
      "info",
      `Task device started at ${new Date().toISOString()}`
    );

    try {
      const result = await this._watchVideoOnDevice(
        serial,
        videoUrl,
        durationSec,
        searchKeyword,
        videoTitle,
        engagementConfig
      );
      await this._updateTaskDevice(taskDevice.id, "completed", {
        completed_at: new Date().toISOString(),
        duration_ms: result.actualDurationSec != null ? result.actualDurationSec * 1000 : null,
        result: {
          watchPercentage: result.watchPercentage,
          liked: result.liked ?? false,
          commented: result.commented ?? false,
          playlisted: result.playlisted ?? false,
        },
      });
      this.supabaseSync.insertExecutionLog(
        taskDevice.id,
        serial,
        "run_task_device_completed",
        {
          task_id: taskDevice.task_id,
          duration_ms: result.actualDurationSec != null ? result.actualDurationSec * 1000 : null,
          watchPercentage: result.watchPercentage,
          liked: result.liked ?? false,
          commented: result.commented ?? false,
          playlisted: result.playlisted ?? false,
        },
        null,
        "success",
        `Completed in ${result.actualDurationSec ?? 0}s, watch ${result.watchPercentage ?? 0}%`
      );
      console.log(`[TaskExecutor] ✓ task_device ${taskDevice.id.substring(0, 8)} completed`);
    } catch (err) {
      console.error(`[TaskExecutor] ✗ task_device ${taskDevice.id.substring(0, 8)} failed: ${err.message}`);
      this.supabaseSync.insertExecutionLog(
        taskDevice.id,
        serial,
        "run_task_device_failed",
        { task_id: taskDevice.task_id, error: err.message },
        null,
        "error",
        err.message
      );
      await this._updateTaskDevice(taskDevice.id, "failed", { error: err.message });
    } finally {
      this._jobRunning.delete(taskDevice.id);
    }
  }

  /**
   * Layer 3: resolve watch duration from config (duration_sec * watch_min~max_pct) or fallback.
   * Phase 5: absolute min 15s (Shorts bot detection), max 20min (timeout alignment).
   */
  _resolveWatchDurationSec(cfg) {
    const ABSOLUTE_MIN_SEC = 15;
    const ABSOLUTE_MAX_SEC = 20 * 60;
    const durationSec = Number(cfg.duration_sec);
    const minPct = Number(cfg.watch_min_pct);
    const maxPct = Number(cfg.watch_max_pct);
    if (Number.isFinite(durationSec) && durationSec > 0 && Number.isFinite(minPct) && Number.isFinite(maxPct)) {
      const pct = _randInt(Math.min(minPct, maxPct), Math.max(minPct, maxPct));
      const calculated = Math.round((durationSec * pct) / 100);
      return Math.min(ABSOLUTE_MAX_SEC, Math.max(ABSOLUTE_MIN_SEC, calculated));
    }
    return Math.min(ABSOLUTE_MAX_SEC, Math.max(ABSOLUTE_MIN_SEC, _randInt(45, 120)));
  }

  /**
   * Phase 11: Convert ratio (0–1) or absolute coords to absolute pixels using device screen size.
   * @param {string} serial
   * @param {{ x_ratio?: number, y_ratio?: number, x?: number, y?: number }} coords
   * @returns {Promise<{x: number, y: number}|null>}
   */
  async _toAbsCoords(serial, coords) {
    if (!coords) return null;
    const screen = await this._getScreenSize(serial);
    if (coords.x_ratio != null && coords.y_ratio != null) {
      return {
        x: Math.round(Number(coords.x_ratio) * screen.width),
        y: Math.round(Number(coords.y_ratio) * screen.height),
      };
    }
    if (coords.x != null && coords.y != null) {
      return { x: Math.round(Number(coords.x)), y: Math.round(Number(coords.y)) };
    }
    return null;
  }

  /**
   * Layer 3: adbShell with up to 3 retries on failure (무응답/에러 시 재시도).
   */
  async _adbShellWithRetry(serial, command, maxAttempts = 3, validator = null) {
    return _withRetry(() => this.xiaowei.adbShell(serial, command), {
      maxAttempts,
      serial,
      command,
      validator,
    });
  }

  async _updateTaskDevice(id, status, extra = {}) {
    const { error } = await this.supabaseSync.supabase
      .from("task_devices")
      .update({ status, ...extra })
      .eq("id", id);
    if (error) console.error(`[TaskExecutor] Failed to update task_device ${id}: ${error.message}`);
  }

  /**
   * 검색 기반으로 YouTube 영상 찾아서 재생. 실패 시 직접 URL 폴백.
   * Galaxy S9 1080x1920: 검색 (930,80), 첫 결과 (540,400), 플레이어 (540,350), 광고 (960,580). See docs/xiaowei-api.md.
   * @param {string} serial - Device serial
   * @param {string} videoUrl - YouTube URL (폴백용)
   * @param {number} durationSec - 시청 시간
   * @param {string} [searchKeyword] - 검색 키워드 (없으면 제목 사용)
   * @param {string} [videoTitle] - 영상 제목 (검색어로 사용)
   * @param {{ probLike?: number, probComment?: number, probSubscribe?: number, probPlaylist?: number, channelName?: string, videoId?: string }} [engagementConfig] - null이면 engagement 비활성화
   * @returns {Promise<{actualDurationSec: number, watchPercentage: number, liked?: boolean, subscribed?: boolean, commented?: boolean, playlisted?: boolean}>}
   */
  async _watchVideoOnDevice(serial, videoUrl, durationSec, searchKeyword, videoTitle, engagementConfig) {
    const startTime = Date.now();
    const eng = engagementConfig || {};
    const waitMinMs = () => (eng.waitMinSec != null ? eng.waitMinSec * 1000 : 1000);
    const waitMaxMs = () => (eng.waitMaxSec != null ? eng.waitMaxSec * 1000 : 5000);
    const stepWait = () => sleep(_randInt(waitMinMs(), waitMaxMs()));

    if (eng.warmupSec && eng.warmupSec > 0) {
      await this._doWarmup(serial, eng.warmupSec);
    }
    await stepWait();

    const personality = this._getPersonality(serial);

    const willLike = Math.random() < this._calcProb(eng.probLike ?? DEFAULT_PROBS.like, personality.likeMult);
    const willSubscribe = Math.random() < this._calcProb(eng.probSubscribe ?? DEFAULT_PROBS.subscribe, personality.subscribeMult);
    const willComment =
      (eng.commentContent || this.commentGenerator) &&
      Math.random() < this._calcProb(eng.probComment ?? DEFAULT_PROBS.comment, personality.commentMult);
    const willPlaylist =
      Math.random() < this._calcProb(eng.probPlaylist ?? DEFAULT_PROBS.playlist, personality.playlistMult);
    const likeAtSec = durationSec * (_randInt(20, 40) / 100);
    const subscribeAtSec = durationSec * (_randInt(60, 80) / 100);
    const commentAtSec = durationSec * (_randInt(40, 65) / 100);
    const playlistAtSec = durationSec * (_randInt(85, 95) / 100);
    const actions = { liked: false, subscribed: false, commented: false, playlisted: false };

    let commentText = eng.commentContent || null;
    if (willComment && !commentText && this.commentGenerator) {
      commentText = await this.commentGenerator.generate(
        videoTitle || "영상",
        eng.channelName || "",
        eng.videoId || ""
      );
      if (!commentText) {
        console.warn(`[Engagement] ${serial.substring(0, 6)} comment generation failed, skip`);
      }
    }

    if (willLike || willComment || willSubscribe || willPlaylist) {
      console.log(
        `[Engagement] ${serial.substring(0, 6)} [${personality.type}] plan: like=${willLike}@${Math.round(likeAtSec)}s comment=${!!(willComment && commentText)}@${Math.round(commentAtSec)}s sub=${willSubscribe}@${Math.round(subscribeAtSec)}s playlist=${willPlaylist}@${Math.round(playlistAtSec)}s`
      );
    }

    await this._adbShellWithRetry(serial, "input keyevent KEYCODE_WAKEUP");
    await sleep(500);
    await stepWait();

    // 세로 모드 강제 (유튜브 명령 전 필수) — accelerometer off, user_rotation 0, content://settings 반영, YouTube 재시작
    await this._adbShellWithRetry(serial, "settings put system accelerometer_rotation 0");
    await this._adbShellWithRetry(serial, "settings put system user_rotation 0");
    await this._adbShellWithRetry(serial, "content insert --uri content://settings/system --bind name:s:accelerometer_rotation --bind value:i:0");
    await this._adbShellWithRetry(serial, "am force-stop com.google.android.youtube");
    await sleep(500);
    await this._adbShellWithRetry(serial, "monkey -p com.google.android.youtube -c android.intent.category.LAUNCHER 1");
    await sleep(_randInt(3000, 5000));
    await stepWait();

    const query = this._buildSearchQuery(searchKeyword, videoTitle, videoUrl);
    console.log(`[TaskExecutor] 🔍 ${serial} searching: "${query}"`);

    const searchSuccess = await this._searchAndSelectVideo(serial, query);
    await stepWait();

    if (!searchSuccess) {
      console.log(`[TaskExecutor] ⚠ ${serial} search failed, falling back to direct URL`);
      await this._adbShellWithRetry(serial, `am start -a android.intent.action.VIEW -d '${videoUrl}'`);
      await sleep(_randInt(4000, 7000));
    }

    // Layer 3: 6초 딜레이 후 광고 스킵
    await sleep(6000);
    await this._trySkipAd(serial);
    await this._ensurePlaying(serial);

    const targetMs = durationSec * 1000;
    const TICK_MS = 5000;
    const AD_CHECK_INTERVAL = 15000;
    let elapsed = 0;

    while (elapsed < targetMs) {
      const waitMs = Math.min(TICK_MS, targetMs - elapsed);
      await sleep(waitMs);
      elapsed += waitMs;
      const elapsedSec = elapsed / 1000;

      if (elapsed % AD_CHECK_INTERVAL < TICK_MS) {
        await this._trySkipAd(serial);
      }
      if (elapsed % 30000 < TICK_MS) {
        await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_WAKEUP");
      }
      if (willLike && !actions.liked && elapsedSec >= likeAtSec) {
        actions.liked = await this._doLike(serial, eng);
      }
      if (willSubscribe && !actions.subscribed && elapsedSec >= subscribeAtSec) {
        actions.subscribed = await this._doSubscribe(serial, eng);
      }
      if (willComment && commentText && !actions.commented && elapsedSec >= commentAtSec) {
        actions.commented = await this._doComment(serial, commentText, eng);
      }
      if (willPlaylist && !actions.playlisted && elapsedSec >= playlistAtSec) {
        actions.playlisted = await this._doSavePlaylist(serial, eng);
      }
    }

    await this.xiaowei.goHome(serial);
    await sleep(500);

    const actualDurationSec = Math.round((Date.now() - startTime) / 1000);
    const watchPercentage = durationSec > 0 ? Math.min(100, Math.round((actualDurationSec / durationSec) * 100)) : 0;
    return {
      actualDurationSec,
      watchPercentage,
      liked: actions.liked,
      subscribed: actions.subscribed,
      commented: actions.commented,
      playlisted: actions.playlisted,
      commentText: actions.commented ? commentText : null,
    };
  }

  /**
   * 검색어 생성: 키워드 > 제목(해시태그 제거) > video ID
   */
  _buildSearchQuery(searchKeyword, videoTitle, videoUrl) {
    if (searchKeyword && String(searchKeyword).trim()) {
      return String(searchKeyword).trim();
    }
    if (videoTitle && String(videoTitle).trim()) {
      return String(videoTitle)
        .replace(/#\S+/g, "")
        .replace(/[[\](){}|]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 50);
    }
    try {
      const url = new URL(videoUrl);
      const v = url.searchParams.get("v");
      return v || videoUrl;
    } catch {
      return videoUrl;
    }
  }

  /**
   * UI dump with polling (Rule B): do not use fixed 2s sleep only. Poll for file existence/freshness 0.5s, max 8s.
   * On failure: log step name, reason, and XML sample (500–1000 chars, no sensitive data).
   * @param {string} serial
   * @param {string} [stepName] - e.g. SEARCH_ICON, SEARCH_BAR, FIRST_RESULT for observability
   * @returns {Promise<string>} XML string or empty on failure
   */
  async _getUiDumpXml(serial, stepName = "UI_DUMP") {
    const DUMP_PATH = "/sdcard/window_dump.xml";
    const POLL_MS = 500;
    const MAX_WAIT_MS = 8000;
    const FRESHNESS_MS = 12000;

    await this.xiaowei.adbShell(serial, `uiautomator dump ${DUMP_PATH}`);
    const deadline = Date.now() + MAX_WAIT_MS;
    let lastXml = "";
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      try {
        const statRes = await this.xiaowei.adbShell(serial, `stat -c %Y ${DUMP_PATH} 2>/dev/null || echo 0`);
        const mtimeSec = parseInt(extractDeviceOutput(statRes), 10) || 0;
        const mtimeMs = mtimeSec * 1000;
        if (mtimeMs > 0 && Date.now() - mtimeMs < FRESHNESS_MS) {
          const dumpRes = await this.xiaowei.adbShell(serial, `cat ${DUMP_PATH}`);
          const xml = extractDeviceOutput(dumpRes);
          if (xml && xml.length > 100) return xml;
          lastXml = xml || "";
        }
      } catch (e) {
        lastXml = (e && e.message) || "";
      }
    }
    try {
      const dumpRes = await this.xiaowei.adbShell(serial, `cat ${DUMP_PATH}`);
      lastXml = extractDeviceOutput(dumpRes) || lastXml;
    } catch {
      // keep lastXml
    }
    const reason = lastXml.length < 50 ? "file missing or too old" : "pattern/file freshness timeout";
    const sample = String(lastXml).replace(/password|token|cookie/gi, "***").substring(0, 800);
    console.warn(
      `[TaskExecutor] ${serial} dump failed step=${stepName} reason=${reason} xml_sample_length=${sample.length}`
    );
    if (sample.length > 0) {
      console.warn(`[TaskExecutor] ${serial} xml_sample: ${sample.substring(0, 500)}...`);
    }
    return "";
  }

  _findBoundsInXml(xml, selector) {
    if (!xml || !selector) return null;

    const escapedResourceId = selector.resourceId ? _escapeRegex(selector.resourceId) : null;
    const escapedContentDesc = selector.contentDesc ? _escapeRegex(selector.contentDesc) : null;
    const escapedTextContains = selector.textContains ? _escapeRegex(selector.textContains) : null;

    let pattern = null;
    if (selector.resourceId) {
      pattern = new RegExp(
        `resource-id="${escapedResourceId}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
        "i"
      );
    } else if (selector.contentDesc) {
      pattern = new RegExp(
        `content-desc="${escapedContentDesc}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
        "i"
      );
    } else if (selector.textContains) {
      pattern = new RegExp(
        `text="[^"]*${escapedTextContains}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
        "i"
      );
    }
    if (!pattern) return null;

    let match = xml.match(pattern);
    if (!match) {
      if (selector.resourceId) {
        const altPattern = new RegExp(
          `bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*resource-id="${escapedResourceId}"`,
          "i"
        );
        match = xml.match(altPattern);
      } else if (selector.contentDesc) {
        const altPattern = new RegExp(
          `bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*content-desc="${escapedContentDesc}"`,
          "i"
        );
        match = xml.match(altPattern);
      } else if (selector.textContains) {
        const altPattern = new RegExp(
          `bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*text="[^"]*${escapedTextContains}[^"]*"`,
          "i"
        );
        match = xml.match(altPattern);
      }
    }
    if (!match) return null;

    return {
      x1: parseInt(match[1], 10),
      y1: parseInt(match[2], 10),
      x2: parseInt(match[3], 10),
      y2: parseInt(match[4], 10),
    };
  }

  async _tapSelectorInXml(serial, xml, selector) {
    const bounds = this._findBoundsInXml(xml, selector);
    if (!bounds) return false;

    const cx = Math.round((bounds.x1 + bounds.x2) / 2);
    const cy = Math.round((bounds.y1 + bounds.y2) / 2);
    await this.xiaowei.adbShell(serial, `input tap ${cx} ${cy}`);
    return true;
  }

  async _findAndTap(serial, selector, retries = 2, stepName = "FIND_AND_TAP") {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const xml = await this._getUiDumpXml(serial, stepName);
        if (!xml) {
          if (attempt < retries) {
            await sleep(1000);
            continue;
          }
          console.warn(`[TaskExecutor] ${serial} ${stepName} failed: no XML (pattern/file)`);
          return false;
        }
        const tapped = await this._tapSelectorInXml(serial, xml, selector);
        if (!tapped) {
          if (attempt < retries) {
            await sleep(1000);
            continue;
          }
          console.warn(`[TaskExecutor] ${serial} ${stepName} failed: selector not found in XML`);
          return false;
        }
        return true;
      } catch (err) {
        if (attempt < retries) {
          await sleep(1000);
          continue;
        }
        console.warn(`[TaskExecutor] ${serial} ${stepName} error: ${err.message}`);
        return false;
      }
    }
    return false;
  }

  /**
   * UI 덤프에서 특정 요소가 존재하는지만 확인 (터치 안 함)
   */
  async _hasElement(serial, selector) {
    try {
      const xml = await this._getUiDumpXml(serial, "HAS_ELEMENT");
      if (!xml) return false;
      if (selector.resourceId) return xml.includes(selector.resourceId);
      if (selector.contentDesc) return xml.includes(selector.contentDesc);
      if (selector.textContains) return xml.includes(selector.textContains);
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 화면 크기 가져오기 (가로/세로 자동 대응)
   */
  async _getScreenSize(serial) {
    try {
      const match = output && output.match(/(\d+)x(\d+)/);
      if (match) {
        return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
      }
    } catch {}
    return { width: 1080, height: 1920 };
  }

  /**
   * Search and select first result (Rule B: list container then first item).
   */
  async _searchAndSelectVideo(serial, query) {
    try {
      let found = await this._findAndTap(serial, YT.SEARCH_BUTTON, 2, "SEARCH_ICON");
      if (!found) found = await this._findAndTap(serial, YT.SEARCH_BUTTON_ALT, 2, "SEARCH_ICON");
      if (!found) {
        console.warn(`[TaskExecutor] ⚠ ${serial} SEARCH_ICON not found`);
        return false;
      }
      await sleep(1500);

      await this._inputText(serial, query);
      await sleep(1000);

      await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_ENTER");
      await sleep(_randInt(3000, 5000));

      // First result: try list container first item (RELATED_VIDEO / thumbnail), then VIDEO_TITLE, then fallback tap
      found = await this._findAndTap(serial, YT.RELATED_VIDEO, 2, "FIRST_RESULT");
      if (!found) found = await this._findAndTap(serial, YT.VIDEO_TITLE, 2, "FIRST_RESULT");
      if (!found) {
        const screenInfo = await this._getScreenSize(serial);
        const tapX = Math.round(screenInfo.width / 2);
        const tapY = Math.round(screenInfo.height * 0.4);
        await this.xiaowei.adbShell(serial, `input tap ${tapX} ${tapY}`);
      }
      await sleep(_randInt(3000, 5000));

      console.log(`[TaskExecutor] ✓ ${serial} search + select done`);
      return true;
    } catch (err) {
      console.error(`[TaskExecutor] ✗ ${serial} search failed: ${err.message}`);
      return false;
    }
  }

  /**
   * ADB로 텍스트 입력. ADBKeyboard broadcast(한글) → 클립보드 붙여넣기 폴백 → ASCII만 input text 폴백.
   */
  async _inputText(serial, text) {
    const str = String(text || "");
    if (!str) return;

    const encoded = Buffer.from(str, "utf-8").toString("base64");
    try {
      const res = await this.xiaowei.adbShell(
        serial,
        `am broadcast -a ADB_INPUT_B64 --es msg '${encoded}' 2>/dev/null`
      );
      const output = extractDeviceOutput(res);
      if (output && output.includes("result=0")) return;
    } catch {
      // fallback
    }

    try {
      const safe = str.replace(/'/g, "");
      await this.xiaowei.adbShell(serial, `am broadcast -a clipper.set -e text '${safe}' 2>/dev/null`);
      await sleep(300);
      await this.xiaowei.adbShell(serial, "input keyevent 279");
      return;
    } catch {
      // fallback to input text (ASCII only)
    }

    if (/^[\x20-\x7e]+$/.test(str)) {
      const forInput = str.replace(/ /g, "%s").replace(/'/g, "");
      await this.xiaowei.adbShell(serial, `input text '${forInput}'`);
    }
  }

  /**
   * Try to skip YouTube ad. 오브젝트 기반 (resource-id/content-desc).
   * @param {string} serial - Device serial
   */
  async _trySkipAd(serial) {
    try {
      const xml = await this._getUiDumpXml(serial);
      if (!xml) return;

      let skipped = await this._tapSelectorInXml(serial, xml, YT.SKIP_AD);
      if (skipped) {
        console.log(`[TaskExecutor] ⏭ ${serial} ad skipped (resource-id)`);
        await sleep(1500);
        return;
      }

      skipped = await this._tapSelectorInXml(serial, xml, YT.SKIP_AD_ALT);
      if (skipped) {
        console.log(`[TaskExecutor] ⏭ ${serial} ad skipped (content-desc)`);
        await sleep(1500);
        return;
      }

      skipped = await this._tapSelectorInXml(serial, xml, { contentDesc: "Skip" });
      if (skipped) {
        console.log(`[TaskExecutor] ⏭ ${serial} ad skipped (Skip)`);
        await sleep(1500);
      }
    } catch (err) {
      // 광고 없으면 무시
    }
  }

  /**
   * Ensure YouTube is playing. 오브젝트 기반 (플레이어/재생·일시정지 버튼).
   * @param {string} serial - Device serial
   */
  async _ensurePlaying(serial) {
    try {
      await this._findAndTap(serial, YT.PLAYER, 0);
      await sleep(1500);

      const playFound = await this._findAndTap(serial, YT.PLAY_PAUSE_ALT, 0);
      if (playFound) {
        console.log(`[TaskExecutor] ▶ ${serial} play button tapped`);
        await sleep(1000);
        return;
      }

      const isPaused = await this._hasElement(serial, YT.PAUSE_ALT);
      if (isPaused) return;

      await this._findAndTap(serial, YT.PLAYER, 0);
      await sleep(500);
      await this._findAndTap(serial, YT.PLAY_PAUSE, 0);
    } catch (err) {
      try {
        const res = await this.xiaowei.adbShell(serial, "dumpsys media_session | grep -E 'state='");
        const output = extractDeviceOutput(res);
        if (output && output.includes("state=2")) {
          await this._findAndTap(serial, YT.PLAYER, 0);
          await sleep(500);
          await this._findAndTap(serial, YT.PLAY_PAUSE, 0);
        }
      } catch {}
    }
  }

  /**
   * 디바이스별 고정 성격 반환 (최초 결정 후 캐싱). engagement-system-design.md
   * @param {string} serial
   * @returns {{ likeMult: number, commentMult: number, subscribeMult: number, playlistMult: number, type: string }}
   */
  _getPersonality(serial) {
    if (this._devicePersonalities.has(serial)) {
      return this._devicePersonalities.get(serial);
    }
    let roll = Math.random() * 100;
    let cumulative = 0;
    let selectedType = "casual";
    for (const entry of PERSONALITY_DISTRIBUTION) {
      cumulative += entry.weight;
      if (roll < cumulative) {
        selectedType = entry.type;
        break;
      }
    }
    const personality = PERSONALITY_TYPES[selectedType];
    const cached = { ...personality, type: selectedType };
    this._devicePersonalities.set(serial, cached);
    console.log(`[Engagement] ${serial.substring(0, 6)} personality: ${selectedType}`);
    return cached;
  }

  /**
   * 최종 확률 계산: baseProb × personalityMult × timeWeight → 0~1
   */
  _calcProb(baseProb, personalityMult) {
    const timeWeight = TIME_WEIGHT[new Date().getHours()] ?? 1.0;
    return Math.min(1.0, (baseProb / 100) * personalityMult * timeWeight);
  }

  /**
   * 좋아요 실행. 스크롤 → LIKE_BUTTON 터치 → 스크롤 복귀.
   * Phase 11: fallback to actionTouchCoords.like_button (ratio → abs) when UI find fails.
   * @param {string} serial
   * @param {object} [eng] - engagementConfig with actionTouchCoords
   * @returns {Promise<boolean>}
   */
  async _doLike(serial, eng) {
    try {
      const screen = await this._getScreenSize(serial);
      const midX = Math.round(screen.width / 2);
      const fromY = Math.round(screen.height * 0.6);
      const toY = Math.round(screen.height * 0.4);
      await this.xiaowei.adbShell(serial, `input swipe ${midX} ${fromY} ${midX} ${toY} ${_randInt(300, 600)}`);
      await sleep(_randInt(800, 1500));

      let tapped = await this._findAndTap(serial, YT.LIKE_BUTTON, 1);
      if (!tapped && eng?.actionTouchCoords?.like_button) {
        const abs = await this._toAbsCoords(serial, eng.actionTouchCoords.like_button);
        if (abs) {
          await this.xiaowei.adbShell(serial, `input tap ${abs.x} ${abs.y}`);
          tapped = true;
        }
      }
      if (!tapped) {
        console.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} like button not found`);
        return false;
      }
      await sleep(_randInt(500, 1000));
      console.log(`[Engagement] 👍 ${serial.substring(0, 6)} liked`);

      await this.xiaowei.adbShell(serial, `input swipe ${midX} ${toY} ${midX} ${fromY} ${_randInt(300, 600)}`);
      await sleep(_randInt(500, 1000));
      return true;
    } catch (err) {
      console.warn(`[Engagement] ✗ ${serial.substring(0, 6)} like failed: ${err.message}`);
      return false;
    }
  }

  /**
   * 구독 실행. 이미 구독 중이면 스킵. SUBSCRIBE_BUTTON 또는 contentDesc "구독" 터치.
   * Phase 11: fallback to actionTouchCoords.subscribe (ratio → abs).
   * @param {string} serial
   * @param {object} [eng] - engagementConfig with actionTouchCoords
   * @returns {Promise<boolean>}
   */
  async _doSubscribe(serial, eng) {
    try {
      const alreadySubscribed = await this._hasElement(serial, YT.SUBSCRIBE_TEXT);
      if (alreadySubscribed) {
        console.log(`[Engagement] 🔔 ${serial.substring(0, 6)} already subscribed, skip`);
        return false;
      }
      let tapped = await this._findAndTap(serial, YT.SUBSCRIBE_BUTTON, 1);
      if (!tapped) tapped = await this._findAndTap(serial, { contentDesc: "구독" }, 1);
      if (!tapped && eng?.actionTouchCoords?.subscribe) {
        const abs = await this._toAbsCoords(serial, eng.actionTouchCoords.subscribe);
        if (abs) {
          await this.xiaowei.adbShell(serial, `input tap ${abs.x} ${abs.y}`);
          tapped = true;
        }
      }
      if (!tapped) {
        console.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} subscribe button not found`);
        return false;
      }
      await sleep(_randInt(1000, 2000));
      const subscribed = await this._hasElement(serial, YT.SUBSCRIBE_TEXT);
      if (subscribed) {
        console.log(`[Engagement] 🔔 ${serial.substring(0, 6)} subscribed!`);
        return true;
      }
      console.log(`[Engagement] 🔔 ${serial.substring(0, 6)} subscribe tapped (unconfirmed)`);
      return true;
    } catch (err) {
      console.warn(`[Engagement] ✗ ${serial.substring(0, 6)} subscribe failed: ${err.message}`);
      return false;
    }
  }

  /**
   * 댓글 작성 실행. 스크롤 → 입력창 터치 → _inputText → 등록 버튼 → 스크롤 복귀.
   * Phase 11: fallback to actionTouchCoords.comment_button (ratio → abs).
   * @param {string} serial - 디바이스 시리얼
   * @param {string} commentText - 작성할 댓글 텍스트
   * @param {object} [eng] - engagementConfig with actionTouchCoords
   * @returns {Promise<boolean>} 성공 여부
   */
  async _doComment(serial, commentText, eng) {
    try {
      const screen = await this._getScreenSize(serial);
      const midX = Math.round(screen.width / 2);

      for (let i = 0; i < 3; i++) {
        await this.xiaowei.adbShell(
          serial,
          `input swipe ${midX} ${Math.round(screen.height * 0.7)} ${midX} ${Math.round(screen.height * 0.3)} ${_randInt(400, 700)}`
        );
        await sleep(_randInt(600, 1000));
      }
      await sleep(_randInt(1000, 1500));

      let found = await this._findAndTap(serial, YT.COMMENT_INPUT, 2);
      if (!found) found = await this._findAndTap(serial, YT.COMMENT_INPUT_ALT, 1);
      if (!found && eng?.actionTouchCoords?.comment_input) {
        const abs = await this._toAbsCoords(serial, eng.actionTouchCoords.comment_input);
        if (abs) {
          await this.xiaowei.adbShell(serial, `input tap ${abs.x} ${abs.y}`);
          found = true;
        }
      }
      if (!found) {
        console.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} comment input not found`);
        await this._scrollBackToVideo(serial, screen);
        return false;
      }
      await sleep(_randInt(1000, 2000));

      await this._inputText(serial, commentText);
      await sleep(_randInt(1000, 2500));

      let posted = await this._findAndTap(serial, YT.COMMENT_POST, 2);
      if (!posted) posted = await this._findAndTap(serial, YT.COMMENT_POST_ALT, 1);
      if (!posted) {
        console.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} comment post button not found`);
        await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_BACK");
        await sleep(500);
        await this._scrollBackToVideo(serial, screen);
        return false;
      }

      await sleep(_randInt(2000, 3000));
      console.log(`[Engagement] 💬 ${serial.substring(0, 6)} commented: "${commentText.substring(0, 30)}..."`);

      await this._scrollBackToVideo(serial, screen);
      return true;
    } catch (err) {
      console.warn(`[Engagement] ✗ ${serial.substring(0, 6)} comment failed: ${err.message}`);
      try {
        await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_BACK");
      } catch {}
      return false;
    }
  }

  /**
   * 영상 플레이어 위치로 스크롤 복귀
   */
  async _scrollBackToVideo(serial, screen) {
    const midX = Math.round(screen.width / 2);
    for (let i = 0; i < 3; i++) {
      await this.xiaowei.adbShell(
        serial,
        `input swipe ${midX} ${Math.round(screen.height * 0.3)} ${midX} ${Math.round(screen.height * 0.7)} ${_randInt(400, 700)}`
      );
      await sleep(_randInt(400, 700));
    }
    await sleep(_randInt(500, 1000));
  }

  /**
   * Layer 3: 재생목록 담기 — 명령 아이콘 터치 후 좌로 스와이프 2회, "담기" 클릭.
   * Phase 11: fallback to actionTouchCoords.save_playlist (ratio → abs).
   * @param {string} serial
   * @param {object} [eng] - engagementConfig with actionTouchCoords
   * @returns {Promise<boolean>}
   */
  async _doSavePlaylist(serial, eng) {
    try {
      let found = await this._findAndTap(serial, YT.SAVE_PLAYLIST, 1);
      if (!found) found = await this._findAndTap(serial, YT.SAVE_PLAYLIST_ALT, 1);
      if (!found && eng?.actionTouchCoords?.save_playlist) {
        const abs = await this._toAbsCoords(serial, eng.actionTouchCoords.save_playlist);
        if (abs) {
          await this.xiaowei.adbShell(serial, `input tap ${abs.x} ${abs.y}`);
          found = true;
        }
      }
      if (!found) {
        console.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} playlist save button not found`);
        return false;
      }
      await sleep(_randInt(1500, 2500));

      const screen = await this._getScreenSize(serial);
      const midY = Math.round(screen.height * 0.5);
      const fromX = Math.round(screen.width * 0.8);
      const toX = Math.round(screen.width * 0.2);
      const duration = _randInt(300, 500);
      await this.xiaowei.adbShell(serial, `input swipe ${fromX} ${midY} ${toX} ${midY} ${duration}`);
      await sleep(400);
      await this.xiaowei.adbShell(serial, `input swipe ${fromX} ${midY} ${toX} ${midY} ${duration}`);
      await sleep(_randInt(800, 1200));

      let tapped = await this._findAndTap(serial, YT.SAVE_ADD, 1);
      if (!tapped) tapped = await this._findAndTap(serial, YT.SAVE_ADD_ALT, 1);
      if (tapped) {
        await sleep(_randInt(1000, 1500));
        console.log(`[Engagement] 📋 ${serial.substring(0, 6)} 담기 (스와이프 2회 후 탭)`);
        return true;
      }

      const selected = await this._findAndTap(serial, YT.WATCH_LATER, 1);
      if (selected) {
        await sleep(_randInt(1000, 1500));
        console.log(`[Engagement] 📋 ${serial.substring(0, 6)} saved to Watch Later`);
      } else {
        await this.xiaowei.adbShell(
          serial,
          `input tap ${Math.round(screen.width / 2)} ${Math.round(screen.height * 0.4)}`
        );
        await sleep(_randInt(1000, 1500));
        console.log(`[Engagement] 📋 ${serial.substring(0, 6)} saved to playlist (first option)`);
      }
      return true;
    } catch (err) {
      console.warn(`[Engagement] ✗ ${serial.substring(0, 6)} playlist save failed: ${err.message}`);
      try {
        await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_BACK");
      } catch {}
      return false;
    }
  }

  /**
   * 디바이스 워밍업 — 자연스러운 탐색 패턴 생성. 메인 시청 작업 전에 실행.
   * @param {string} serial - 디바이스 시리얼
   * @param {number} [durationSec=120] - 워밍업 총 시간 (초)
   */
  async _doWarmup(serial, durationSec = 120) {
    try {
      console.log(`[Warmup] 🔥 ${serial.substring(0, 6)} starting warmup (${durationSec}s)`);
      const screen = await this._getScreenSize(serial);
      const midX = Math.round(screen.width / 2);

      await this.xiaowei.adbShell(serial, "am force-stop com.google.android.youtube");
      await sleep(1000);
      await this.xiaowei.adbShell(serial, "monkey -p com.google.android.youtube -c android.intent.category.LAUNCHER 1");
      await sleep(_randInt(3000, 5000));

      await this._findAndTap(serial, YT.BOTTOM_NAV_HOME, 0);
      await sleep(_randInt(1500, 2500));

      const scrollCount = _randInt(2, 4);
      for (let i = 0; i < scrollCount; i++) {
        await this.xiaowei.adbShell(
          serial,
          `input swipe ${midX} ${Math.round(screen.height * 0.7)} ${midX} ${Math.round(screen.height * 0.3)} ${_randInt(500, 900)}`
        );
        await sleep(_randInt(1500, 3000));
      }

      const startTime = Date.now();
      const targetMs = durationSec * 1000;
      let videosWatched = 0;

      while (Date.now() - startTime < targetMs && videosWatched < 3) {
        const tapY = Math.round(screen.height * (_randInt(35, 65) / 100));
        await this.xiaowei.adbShell(serial, `input tap ${midX} ${tapY}`);
        await sleep(_randInt(3000, 5000));

        await this._trySkipAd(serial);
        await sleep(1000);
        await this._ensurePlaying(serial);

        const watchTime = _randInt(30, 90) * 1000;
        const remaining = targetMs - (Date.now() - startTime);
        const actualWatch = Math.min(watchTime, remaining);

        if (actualWatch <= 0) break;

        let watched = 0;
        while (watched < actualWatch) {
          await sleep(5000);
          watched += 5000;
          if (watched % 15000 < 5000) await this._trySkipAd(serial);
          if (watched % 30000 < 5000) await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_WAKEUP");
        }

        videosWatched++;
        console.log(
          `[Warmup] ${serial.substring(0, 6)} watched video #${videosWatched} (${Math.round(actualWatch / 1000)}s)`
        );

        if (Math.random() < 0.5 && Date.now() - startTime < targetMs) {
          await this.xiaowei.adbShell(
            serial,
            `input swipe ${midX} ${Math.round(screen.height * 0.7)} ${midX} ${Math.round(screen.height * 0.3)} ${_randInt(400, 700)}`
          );
          await sleep(_randInt(1000, 2000));
          await this._findAndTap(serial, YT.RELATED_VIDEO, 0);
          await sleep(_randInt(3000, 5000));
        } else {
          await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_BACK");
          await sleep(_randInt(1500, 2500));
          await this.xiaowei.adbShell(
            serial,
            `input swipe ${midX} ${Math.round(screen.height * 0.7)} ${midX} ${Math.round(screen.height * 0.3)} ${_randInt(500, 900)}`
          );
          await sleep(_randInt(1500, 2500));
        }
      }

      await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_HOME");
      await sleep(500);
      console.log(
        `[Warmup] ✓ ${serial.substring(0, 6)} warmup done (${videosWatched} videos, ${Math.round((Date.now() - startTime) / 1000)}s)`
      );
    } catch (err) {
      console.error(`[Warmup] ✗ ${serial.substring(0, 6)} warmup error: ${err.message}`);
      try {
        await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_HOME");
      } catch {}
    }
  }

  /**
   * 디바이스가 워밍업이 필요한지 판단. 최근 1시간 내 작업 이력이 없으면 true.
   */
  _shouldWarmup(serial) {
    const key = `lastTask_${serial}`;
    const lastTask = this._warmupTracker.get(key);
    const now = Date.now();

    this._warmupTracker.set(key, now);

    if (!lastTask || now - lastTask > 3600000) {
      return true;
    }
    return false;
  }

  /**
   * Execute a task
   * @param {object} task - Task row from Supabase
   */
  async execute(task) {
    if (this.running.size >= this.maxConcurrent) {
      console.log(
        `[TaskExecutor] Max concurrent tasks reached (${this.maxConcurrent}), skipping ${task.id}`
      );
      return;
    }

    if (this.running.has(task.id)) {
      return; // Already running
    }

    this.running.add(task.id);
    this.stats.total++;
    const taskType = task.task_name || task.task_type || task.type;
    const startTime = Date.now();

    console.log(`[TaskExecutor] ▶ ${task.id} (${taskType})`);

    try {
      // 1. Mark as running
      await this.supabaseSync.updateTaskStatus(task.id, "running", null, null);

      // 2. Check Xiaowei connection
      if (!this.xiaowei.connected) {
        throw new Error("Xiaowei is not connected");
      }

      // 3. Fetch per-device configs from task_devices
      const deviceConfigs = await this._fetchDeviceConfigs(task.id);

      // 4. Execute based on task type — _dispatch logs the specific Xiaowei command
      const devices = this._resolveDevices(task);
      const result = await this._dispatch(taskType, task, devices, deviceConfigs);
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      // 5. Extract response summary for logging
      const summary = _extractResponseSummary(result);

      // 6. Log success
      await this.supabaseSync.insertExecutionLog(
        task.id,
        devices,
        taskType,
        task.payload,
        result,
        "success",
        `Task completed (${durationSec}s)${summary ? ` — ${summary}` : ""}`
      );

      // 7. Update video play_count if this was a batch task
      if (deviceConfigs.size > 0) {
        await this._updateVideoPlayCounts(deviceConfigs);
      }

      // 8. Mark completed
      await this.supabaseSync.updateTaskStatus(task.id, "completed", result, null);
      this.stats.succeeded++;
      console.log(`[TaskExecutor] ✓ ${task.id} completed (${durationSec}s)${summary ? ` — ${summary}` : ""}`);
    } catch (err) {
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      this.stats.failed++;
      console.error(`[TaskExecutor] ✗ ${task.id} failed: ${err.message} (${durationSec}s)`);

      // Log failure
      await this.supabaseSync.insertExecutionLog(
        task.id,
        task.target_devices ? task.target_devices.join(",") : "all",
        taskType,
        task.payload,
        null,
        "error",
        `${err.message} (${durationSec}s)`
      );

      // Mark failed and increment retry
      await this.supabaseSync.updateTaskStatus(task.id, "failed", null, err.message);
      await this.supabaseSync.incrementRetryCount(task.id);
    } finally {
      this.running.delete(task.id);
    }
  }

  /**
   * Fetch per-device configs from task_devices table
   * @param {string} taskId
   * @returns {Promise<Map<string, {video_url: string, video_id: string}>>}
   */
  async _fetchDeviceConfigs(taskId) {
    try {
      const { data, error } = await this.supabaseSync.supabase
        .from("task_devices")
        .select("device_serial, config")
        .eq("task_id", taskId);

      if (error) {
        console.warn(`[TaskExecutor] Failed to fetch task_devices: ${error.message}`);
        return new Map();
      }

      if (!data || data.length === 0) {
        return new Map();
      }

      const configs = new Map();
      for (const row of data) {
        const cfg = row.config || {};
        if (row.device_serial && cfg.video_url && cfg.video_id) {
          configs.set(row.device_serial, { video_url: cfg.video_url, video_id: cfg.video_id });
        }
      }

      console.log(`[TaskExecutor] Loaded ${configs.size} per-device configs from task_devices`);
      return configs;
    } catch (err) {
      console.warn(`[TaskExecutor] task_devices query failed — skipping (${err.message})`);
      return new Map();
    }
  }

  /**
   * Update video play counts after task completion
   * @param {Map<string, {video_url: string, video_id: string}>} deviceConfigs
   */
  async _updateVideoPlayCounts(deviceConfigs) {
    const videoIdCounts = new Map();
    for (const config of deviceConfigs.values()) {
      const count = videoIdCounts.get(config.video_id) ?? 0;
      videoIdCounts.set(config.video_id, count + 1);
    }

    for (const [videoId, count] of videoIdCounts) {
      const { error } = await this.supabaseSync.supabase
        .from("videos")
        .update({ play_count: this.supabaseSync.supabase.rpc("increment", { x: count }) })
        .eq("id", videoId);

      if (error) {
        console.warn(`[TaskExecutor] Failed to increment play_count for video ${videoId}: ${error.message}`);
      }
    }
  }

  /**
   * Resolve which devices to target
   * @param {object} task
   * @returns {string} comma-separated serials or "all"
   */
  _resolveDevices(task) {
    if (task.target_devices && task.target_devices.length > 0) {
      return task.target_devices.join(",");
    }
    return "all";
  }

  /**
   * Dispatch task to the correct Xiaowei API call
   * @param {string} taskType
   * @param {object} task
   * @param {string} devices
   * @param {Map<string, {video_url: string, video_id: string}>} deviceConfigs
   * @returns {Promise<object>}
   */
  async _dispatch(taskType, task, devices, deviceConfigs) {
    const payload = task.payload || {};
    const options = {
      count: payload.count || 1,
      taskInterval: payload.taskInterval || [1000, 3000],
      deviceInterval: payload.deviceInterval || "500",
    };

    switch (taskType) {
      case "watch_video":
      case "view_farm":
        return this._executeWatchVideo(devices, payload, options, deviceConfigs);

      case "subscribe": {
        const actionName = payload.actionName || "YouTube_구독";
        console.log(`[TaskExecutor]   Xiaowei actionCreate: ${actionName} → ${devices}`);
        return this.xiaowei.actionCreate(devices, actionName, options);
      }

      case "like": {
        const actionName = payload.actionName || "YouTube_좋아요";
        console.log(`[TaskExecutor]   Xiaowei actionCreate: ${actionName} → ${devices}`);
        return this.xiaowei.actionCreate(devices, actionName, options);
      }

      case "comment":
        return this._executeComment(devices, payload, options);

      case "custom":
        return this._executeCustom(devices, payload, options);

      case "action":
        if (!payload.actionName) {
          throw new Error("actionName is required for action type");
        }
        console.log(`[TaskExecutor]   Xiaowei actionCreate: ${payload.actionName} → ${devices}`);
        return this.xiaowei.actionCreate(devices, payload.actionName, options);

      case "script":
        if (!payload.scriptPath) {
          throw new Error("scriptPath is required for script type");
        }
        console.log(`[TaskExecutor]   Xiaowei autojsCreate: ${payload.scriptPath} → ${devices}`);
        return this.xiaowei.autojsCreate(devices, payload.scriptPath, options);

      case "adb":
        if (!payload.command) {
          throw new Error("command is required for adb type");
        }
        console.log(`[TaskExecutor]   Xiaowei adb: "${payload.command}" → ${devices}`);
        return this.xiaowei.adb(devices, payload.command);

      case "adb_shell":
        if (!payload.command) {
          throw new Error("command is required for adb_shell type");
        }
        console.log(`[TaskExecutor]   Xiaowei adbShell: "${payload.command}" → ${devices}`);
        return this.xiaowei.adbShell(devices, payload.command);

      case "start_app":
        if (!payload.packageName) {
          throw new Error("packageName is required for start_app type");
        }
        console.log(`[TaskExecutor]   Xiaowei startApk: ${payload.packageName} → ${devices}`);
        return this.xiaowei.startApk(devices, payload.packageName);

      case "stop_app":
        if (!payload.packageName) {
          throw new Error("packageName is required for stop_app type");
        }
        console.log(`[TaskExecutor]   Xiaowei stopApk: ${payload.packageName} → ${devices}`);
        return this.xiaowei.stopApk(devices, payload.packageName);

      case "install_apk":
        if (!payload.filePath) {
          throw new Error("filePath is required for install_apk type");
        }
        console.log(`[TaskExecutor]   Xiaowei installApk: ${payload.filePath} → ${devices}`);
        return this.xiaowei.installApk(devices, payload.filePath);

      case "screenshot":
        console.log(`[TaskExecutor]   Xiaowei screen → ${devices}`);
        return this.xiaowei.screen(devices, payload.savePath);

      case "push_event":
        if (payload.type == null || payload.type === undefined) {
          throw new Error("type is required for push_event (0=back, 1=home, 2=recents)");
        }
        console.log(`[TaskExecutor]   Xiaowei pushEvent: type=${payload.type} → ${devices}`);
        return this.xiaowei.pushEvent(devices, String(payload.type));

      case "run_script":
        if (!payload.scriptPath) {
          throw new Error("scriptPath is required for run_script type");
        }
        const runScriptPath = this._resolveScriptPath(payload.scriptPath);
        console.log(`[TaskExecutor]   Xiaowei autojsCreate: ${payload.scriptPath} → ${devices}`);
        return this.xiaowei.autojsCreate(devices, runScriptPath, options);

      case "actionCreate":
        if (!payload.actionName) {
          throw new Error("actionName is required for actionCreate type");
        }
        console.log(`[TaskExecutor]   Xiaowei actionCreate: ${payload.actionName} → ${devices}`);
        return this.xiaowei.actionCreate(devices, payload.actionName, options);

      default:
        throw new Error(`Unknown task type: ${taskType}`);
    }
  }

  async _executeWatchVideo(devices, payload, options, deviceConfigs) {
    // If we have per-device configs (batch task), execute individually for each device
    if (deviceConfigs && deviceConfigs.size > 0) {
      console.log(`[TaskExecutor]   Batch execution: ${deviceConfigs.size} devices with individual videos`);
      const results = [];

      for (const [deviceSerial, config] of deviceConfigs) {
        const devicePayload = { ...payload, video_url: config.video_url };
        console.log(`[TaskExecutor]   Device ${deviceSerial} → ${config.video_url}`);

        if (payload.actionName) {
          const result = await this.xiaowei.actionCreate(deviceSerial, payload.actionName, options);
          results.push({ device: deviceSerial, result });
        } else {
          const scriptName = payload.scriptPath || "youtube_watch.js";
          const scriptPath = this._resolveScriptPath(scriptName);
          const result = await this.xiaowei.autojsCreate(deviceSerial, scriptPath, {
            ...options,
            taskInterval: payload.taskInterval || [2000, 5000],
            deviceInterval: payload.deviceInterval || "1000",
          });
          results.push({ device: deviceSerial, result });
        }
      }

      return { batch: true, results };
    }

    // Fall back to standard execution (all devices get same video)
    if (payload.actionName) {
      console.log(`[TaskExecutor]   Xiaowei actionCreate: ${payload.actionName} → ${devices}`);
      return this.xiaowei.actionCreate(devices, payload.actionName, options);
    }

    const scriptName = payload.scriptPath || "youtube_watch.js";
    const scriptPath = this._resolveScriptPath(scriptName);
    console.log(`[TaskExecutor]   Xiaowei autojsCreate: ${scriptName} → ${devices}`);
    return this.xiaowei.autojsCreate(devices, scriptPath, {
      ...options,
      taskInterval: payload.taskInterval || [2000, 5000],
      deviceInterval: payload.deviceInterval || "1000",
    });
  }

  async _executeComment(devices, payload, options) {
    if (payload.scriptPath) {
      const scriptPath = this._resolveScriptPath(payload.scriptPath);
      console.log(`[TaskExecutor]   Xiaowei autojsCreate: ${payload.scriptPath} → ${devices}`);
      return this.xiaowei.autojsCreate(devices, scriptPath, options);
    }

    const actionName = payload.actionName || "YouTube_댓글";
    console.log(`[TaskExecutor]   Xiaowei actionCreate: ${actionName} → ${devices}`);
    return this.xiaowei.actionCreate(devices, actionName, options);
  }

  async _executeCustom(devices, payload, options) {
    if (!payload.scriptPath) {
      throw new Error("scriptPath is required for custom task type");
    }
    const scriptPath = this._resolveScriptPath(payload.scriptPath);
    console.log(`[TaskExecutor]   Xiaowei autojsCreate: ${payload.scriptPath} → ${devices}`);
    return this.xiaowei.autojsCreate(devices, scriptPath, {
      ...options,
      taskInterval: payload.taskInterval || [2000, 5000],
      deviceInterval: payload.deviceInterval || "1000",
    });
  }

  /**
   * Resolve script path: if relative, prepend scriptsDir
   * @param {string} scriptPath
   * @returns {string} absolute path
   */
  _resolveScriptPath(scriptPath) {
    if (path.isAbsolute(scriptPath)) {
      return scriptPath;
    }
    if (this.config.scriptsDir) {
      return path.join(this.config.scriptsDir, scriptPath);
    }
    return scriptPath;
  }

  /** Get current running task count */
  get runningCount() {
    return this.running.size;
  }

  /** Get execution stats */
  getStats() {
    return { ...this.stats, running: this.running.size };
  }
}

/**
 * Extract a short summary from Xiaowei response for logging.
 * @param {object} result
 * @returns {string|null}
 */
function _extractResponseSummary(result) {
  return summarizeResponse(result);
}

module.exports = TaskExecutor;
