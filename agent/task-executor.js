/**
 * DoAi.Me - Task Execution Engine
 * Maps Supabase tasks to Xiaowei WebSocket commands
 */
const path = require("path");
const { getLogger } = require("./common/logger");
const log = getLogger("task-executor");
const CommentGenerator = require("./comment-generator");

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wrap a promise with a timeout; rejects with Error if ms elapses first. */
function _withTimeout(promise, ms) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Task execution timeout after ${Math.round(ms / 1000)}s`)),
      ms
    );
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function _escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract shell command output from Xiaowei adbShell response (code, msg, data, stdout). */
function _extractShellOutput(res) {
  if (res == null) return "";
  if (typeof res === "string") return res;
  if (res.data != null) return Array.isArray(res.data) ? (res.data[0] != null ? String(res.data[0]) : "") : String(res.data);
  if (res.msg != null) return String(res.msg);
  if (res.stdout != null) return String(res.stdout);
  return String(res);
}

/** Task types that use job_assignments (per-device config). Others (adb_shell, adb, etc.) skip it. */
const JOB_ASSIGNMENT_TASK_TYPES = new Set([
  "watch_video", "view_farm", "subscribe", "like", "comment", "custom", "action", "script", "run_script", "actionCreate",
]);

function _taskTypeUsesJobAssignments(taskType) {
  return taskType && JOB_ASSIGNMENT_TASK_TYPES.has(taskType);
}

/** Random int [min, max] inclusive */
function _randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
      log.info("[TaskExecutor] ✓ CommentGenerator initialized (OpenAI)");
    } else {
      log.info("[TaskExecutor] ⚠ OPENAI_API_KEY not set — comments disabled");
    }

    this._warmupTracker = new Map();
  }

  /**
   * Start polling for pending job_assignments and execute them (open YouTube URL, watch duration, mark completed).
   * @param {number} [intervalMs] - Poll interval (default 15000)
   */
  startJobAssignmentPolling(intervalMs = 15000) {
    this._jobPollIntervalMs = intervalMs;
    if (this._jobPollHandle) return;
    log.info(`[TaskExecutor] Job assignment polling started (${intervalMs / 1000}s)`);
    this._jobPollHandle = setInterval(() => this._pollJobAssignments(), intervalMs);
    this._pollJobAssignments();
  }

  stopJobAssignmentPolling() {
    if (this._jobPollHandle) {
      clearInterval(this._jobPollHandle);
      this._jobPollHandle = null;
      log.info("[TaskExecutor] Job assignment polling stopped");
    }
  }

  /**
   * Run a single job assignment (used by DeviceOrchestrator).
   * @param {object} assignment - { id, job_id, device_id, device_serial, ... }
   */
  async runAssignment(assignment) {
    if (!assignment) {
      log.error("[TaskExecutor] runAssignment: assignment is null/undefined");
      return;
    }
    return this._executeJobAssignment(assignment);
  }

  async _pollJobAssignments() {
    if (this._jobRunning.size >= this._maxConcurrentJobs) return;
    if (!this.xiaowei.connected) return;

    const pcId = this.supabaseSync.pcId;
    if (!pcId) return;

    try {
      const { data: devices } = await this.supabaseSync.supabase
        .from("devices")
        .select("id")
        .eq("pc_id", pcId)
        .in("status", ["online", "busy"]);

      if (!devices || devices.length === 0) return;

      const deviceIds = devices.map((d) => d.id);
      const limit = this._maxConcurrentJobs - this._jobRunning.size;

      const { data: assignments, error } = await this.supabaseSync.supabase
        .from("job_assignments")
        .select("id, job_id, device_id, device_serial, status")
        .in("device_id", deviceIds)
        .eq("status", "pending")
        .limit(limit);

      if (error || !assignments || assignments.length === 0) return;

      for (const row of assignments) {
        if (!row || row.id == null) {
          log.warn("[TaskExecutor] Skipping job_assignment row with missing id");
          continue;
        }
        if (this._jobRunning.has(row.id)) continue;

        // Atomic claim: CAS update pending → running to prevent duplicate execution
        const { data: claimed, error: claimErr } = await this.supabaseSync.supabase
          .from("job_assignments")
          .update({ status: "running", started_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();

        if (claimErr || !claimed) {
          if (claimErr) {
            log.warn(`[TaskExecutor] Claim failed for ${row.id}: ${claimErr.message}`);
          }
          continue;
        }

        log.info(`[TaskExecutor] Claimed job assignment ${row.id} → ${row.device_serial}`);
        this._executeJobAssignment(row).catch((err) => {
          log.error(`[TaskExecutor] Job assignment ${row.id} error: ${err.message}`);
        });
      }
    } catch (err) {
      log.warn(`[TaskExecutor] Job poll error: ${err.message}`);
    }
  }

  async _executeJobAssignment(assignment) {
    if (!assignment) {
      log.error("[TaskExecutor] _executeJobAssignment: assignment is null/undefined");
      return;
    }
    if (assignment.id == null) {
      log.error("[TaskExecutor] _executeJobAssignment: assignment.id is missing");
      return;
    }
    this._jobRunning.add(assignment.id);
    const serial = assignment.device_serial;
    if (!serial) {
      await this._updateJobAssignment(assignment.id, "failed", { error_log: "No device_serial" });
      this._jobRunning.delete(assignment.id);
      return;
    }

    try {
      if (assignment.job_id == null) {
        await this._updateJobAssignment(assignment.id, "failed", { error_log: "No job_id" });
        this._jobRunning.delete(assignment.id);
        log.error("[TaskExecutor] _executeJobAssignment: assignment.job_id is missing");
        return;
      }
      const { data: job, error: jobErr } = await this.supabaseSync.supabase
        .from("jobs")
        .select("target_url, duration_sec, duration_min_pct, duration_max_pct, keyword, video_title, title, prob_like, prob_comment, prob_playlist")
        .eq("id", assignment.job_id)
        .single();

      if (jobErr || !job || !job.target_url) {
        await this._updateJobAssignment(assignment.id, "failed", { error_log: "Job not found or no target_url" });
        this._jobRunning.delete(assignment.id);
        return;
      }

      // Status already set to "running" by atomic claim in _pollJobAssignments

      const minSec = Math.round((job.duration_sec || 60) * (job.duration_min_pct || 30) / 100);
      const maxSec = Math.round((job.duration_sec || 60) * (job.duration_max_pct || 90) / 100);
      const watchDurationSec = _randInt(minSec, maxSec);

      log.info(`[TaskExecutor] Job assignment ${assignment.id} → ${serial} watch ${watchDurationSec}s`);

      const searchKeyword = job.keyword || null;
      const videoTitle = job.video_title || job.title || null;
      let videoId = "";
      try {
        const u = new URL(job.target_url);
        videoId = u.searchParams.get("v") || "";
      } catch {}
      const warmupSec = this._shouldWarmup(serial) ? _randInt(60, 180) : 0;
      const engagementConfig = {
        probLike: job.prob_like ?? DEFAULT_PROBS.like,
        probComment: job.prob_comment ?? DEFAULT_PROBS.comment,
        probSubscribe: DEFAULT_PROBS.subscribe,
        probPlaylist: job.prob_playlist ?? DEFAULT_PROBS.playlist,
        channelName: "",
        videoId,
        warmupSec,
      };
      const result = await this._watchVideoOnDevice(
        serial,
        job.target_url,
        watchDurationSec,
        searchKeyword,
        videoTitle,
        engagementConfig
      );

      const { error: completeErr } = await this.supabaseSync.supabase
        .from("job_assignments")
        .update({
          status: "completed",
          progress_pct: 100,
          completed_at: new Date().toISOString(),
          ...(result.actualDurationSec != null && { final_duration_sec: result.actualDurationSec }),
          ...(result.watchPercentage != null && { watch_percentage: result.watchPercentage }),
          did_like: result.liked ?? false,
          did_comment: result.commented ?? false,
          did_playlist: result.playlisted ?? false,
        })
        .eq("id", assignment.id);

      if (completeErr) {
        log.error(`[TaskExecutor] Failed to mark ${assignment.id} completed: ${completeErr.message}`);
      }

      log.info(`[TaskExecutor] ✓ Job assignment ${assignment.id} completed (${result.actualDurationSec}s, ${result.watchPercentage}%)`);
    } catch (err) {
      log.error(`[TaskExecutor] ✗ Job assignment ${assignment.id} failed: ${err.message}`);
      const ok = await this._updateJobAssignment(assignment.id, "failed", { error_log: err.message });
      if (!ok) {
        log.error(`[TaskExecutor] CRITICAL: Could not mark ${assignment.id} as failed — may remain stuck in running`);
      }
    } finally {
      this._jobRunning.delete(assignment.id);
    }
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

    if (eng.warmupSec && eng.warmupSec > 0) {
      await this._doWarmup(serial, eng.warmupSec);
    }

    const personality = this._getPersonality(serial);

    const willLike = Math.random() < this._calcProb(eng.probLike ?? DEFAULT_PROBS.like, personality.likeMult);
    const willSubscribe = Math.random() < this._calcProb(eng.probSubscribe ?? DEFAULT_PROBS.subscribe, personality.subscribeMult);
    const willComment =
      this.commentGenerator &&
      Math.random() < this._calcProb(eng.probComment ?? DEFAULT_PROBS.comment, personality.commentMult);
    const willPlaylist =
      Math.random() < this._calcProb(eng.probPlaylist ?? DEFAULT_PROBS.playlist, personality.playlistMult);
    const likeAtSec = durationSec * (_randInt(20, 40) / 100);
    const subscribeAtSec = durationSec * (_randInt(60, 80) / 100);
    const commentAtSec = durationSec * (_randInt(40, 65) / 100);
    const playlistAtSec = durationSec * (_randInt(85, 95) / 100);
    const actions = { liked: false, subscribed: false, commented: false, playlisted: false };

    let commentText = null;
    if (willComment) {
      commentText = await this.commentGenerator.generate(
        videoTitle || "영상",
        eng.channelName || "",
        eng.videoId || ""
      );
      if (!commentText) {
        log.warn(`[Engagement] ${serial.substring(0, 6)} comment generation failed, skip`);
      }
    }

    if (willLike || willComment || willSubscribe || willPlaylist) {
      log.info(
        `[Engagement] ${serial.substring(0, 6)} [${personality.type}] plan: like=${willLike}@${Math.round(likeAtSec)}s comment=${!!(willComment && commentText)}@${Math.round(commentAtSec)}s sub=${willSubscribe}@${Math.round(subscribeAtSec)}s playlist=${willPlaylist}@${Math.round(playlistAtSec)}s`
      );
    }

    await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_WAKEUP");
    await _sleep(500);

    // 세로 모드 강제 (Galaxy S9)
    await this.xiaowei.adbShell(serial, "settings put system accelerometer_rotation 0");
    await this.xiaowei.adbShell(serial, "settings put system user_rotation 0");
    await this.xiaowei.adbShell(serial, "am force-stop com.google.android.youtube");
    await _sleep(1000);
    await this.xiaowei.adbShell(serial, "monkey -p com.google.android.youtube -c android.intent.category.LAUNCHER 1");
    await _sleep(_randInt(3000, 5000));

    const query = this._buildSearchQuery(searchKeyword, videoTitle, videoUrl);
    log.info(`[TaskExecutor] 🔍 ${serial} searching: "${query}"`);

    const searchSuccess = await this._searchAndSelectVideo(serial, query);

    if (!searchSuccess) {
      log.info(`[TaskExecutor] ⚠ ${serial} search failed, falling back to direct URL`);
      await this.xiaowei.adbShell(serial, `am start -a android.intent.action.VIEW -d '${videoUrl}'`);
      await _sleep(_randInt(4000, 7000));
    }

    await _sleep(3000);
    await this._trySkipAd(serial);
    await this._ensurePlaying(serial);

    const targetMs = durationSec * 1000;
    const TICK_MS = 5000;
    const AD_CHECK_INTERVAL = 15000;
    let elapsed = 0;

    while (elapsed < targetMs) {
      const waitMs = Math.min(TICK_MS, targetMs - elapsed);
      await _sleep(waitMs);
      elapsed += waitMs;
      const elapsedSec = elapsed / 1000;

      if (elapsed % AD_CHECK_INTERVAL < TICK_MS) {
        await this._trySkipAd(serial);
      }
      if (elapsed % 30000 < TICK_MS) {
        await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_WAKEUP");
      }
      if (willLike && !actions.liked && elapsedSec >= likeAtSec) {
        actions.liked = await this._doLike(serial);
      }
      if (willSubscribe && !actions.subscribed && elapsedSec >= subscribeAtSec) {
        actions.subscribed = await this._doSubscribe(serial);
      }
      if (willComment && commentText && !actions.commented && elapsedSec >= commentAtSec) {
        actions.commented = await this._doComment(serial, commentText);
      }
      if (willPlaylist && !actions.playlisted && elapsedSec >= playlistAtSec) {
        actions.playlisted = await this._doSavePlaylist(serial);
      }
    }

    await this.xiaowei.goHome(serial);
    await _sleep(500);

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
   * UI 요소를 찾아서 터치. uiautomator dump → resource-id/content-desc로 요소 찾기 → bounds 중심 좌표 계산 → 터치. 화면 방향 무관.
   * @param {string} serial
   * @param {object} selector - { resourceId, contentDesc, textContains } 중 하나 이상
   * @param {number} [retries=2]
   * @returns {Promise<boolean>}
   */
  async _getUiDumpXml(serial) {
    await this.xiaowei.adbShell(serial, "uiautomator dump /sdcard/window_dump.xml");
    await _sleep(500);
    const dumpRes = await this.xiaowei.adbShell(serial, "cat /sdcard/window_dump.xml");
    return _extractShellOutput(dumpRes);
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

  async _findAndTap(serial, selector, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const xml = await this._getUiDumpXml(serial);
        if (!xml) continue;
        const tapped = await this._tapSelectorInXml(serial, xml, selector);
        if (!tapped) {
          if (attempt < retries) {
            await _sleep(1000);
            continue;
          }
          return false;
        }
        return true;
      } catch (err) {
        if (attempt < retries) {
          await _sleep(1000);
          continue;
        }
        log.warn(`[TaskExecutor] _findAndTap error: ${err.message}`);
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
      await this.xiaowei.adbShell(serial, "uiautomator dump /sdcard/window_dump.xml");
      await _sleep(500);
      const dumpRes = await this.xiaowei.adbShell(serial, "cat /sdcard/window_dump.xml");
      const xml = _extractShellOutput(dumpRes);
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
      const res = await this.xiaowei.adbShell(serial, "wm size");
      const output = _extractShellOutput(res);
      const match = output && output.match(/(\d+)x(\d+)/);
      if (match) {
        return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
      }
    } catch {}
    return { width: 1080, height: 1920 };
  }

  /**
   * YouTube 검색 후 첫 번째 결과 선택. 오브젝트 기반 (resource-id/content-desc).
   */
  async _searchAndSelectVideo(serial, query) {
    try {
      let found = await this._findAndTap(serial, YT.SEARCH_BUTTON);
      if (!found) found = await this._findAndTap(serial, YT.SEARCH_BUTTON_ALT);
      if (!found) {
        log.warn(`[TaskExecutor] ⚠ ${serial} search button not found`);
        return false;
      }
      await _sleep(1500);

      await this._inputText(serial, query);
      await _sleep(1000);

      await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_ENTER");
      await _sleep(_randInt(3000, 5000));

      found = await this._findAndTap(serial, YT.VIDEO_TITLE);
      if (!found) {
        const screenInfo = await this._getScreenSize(serial);
        const tapX = Math.round(screenInfo.width / 2);
        const tapY = Math.round(screenInfo.height * 0.4);
        await this.xiaowei.adbShell(serial, `input tap ${tapX} ${tapY}`);
      }
      await _sleep(_randInt(3000, 5000));

      log.info(`[TaskExecutor] ✓ ${serial} search + select done`);
      return true;
    } catch (err) {
      log.error(`[TaskExecutor] ✗ ${serial} search failed: ${err.message}`);
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
      const output = _extractShellOutput(res);
      if (output && output.includes("result=0")) return;
    } catch {
      // fallback
    }

    try {
      const safe = str.replace(/'/g, "");
      await this.xiaowei.adbShell(serial, `am broadcast -a clipper.set -e text '${safe}' 2>/dev/null`);
      await _sleep(300);
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
        log.info(`[TaskExecutor] ⏭ ${serial} ad skipped (resource-id)`);
        await _sleep(1500);
        return;
      }

      skipped = await this._tapSelectorInXml(serial, xml, YT.SKIP_AD_ALT);
      if (skipped) {
        log.info(`[TaskExecutor] ⏭ ${serial} ad skipped (content-desc)`);
        await _sleep(1500);
        return;
      }

      skipped = await this._tapSelectorInXml(serial, xml, { contentDesc: "Skip" });
      if (skipped) {
        log.info(`[TaskExecutor] ⏭ ${serial} ad skipped (Skip)`);
        await _sleep(1500);
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
      await _sleep(1500);

      const playFound = await this._findAndTap(serial, YT.PLAY_PAUSE_ALT, 0);
      if (playFound) {
        log.info(`[TaskExecutor] ▶ ${serial} play button tapped`);
        await _sleep(1000);
        return;
      }

      const isPaused = await this._hasElement(serial, YT.PAUSE_ALT);
      if (isPaused) return;

      await this._findAndTap(serial, YT.PLAYER, 0);
      await _sleep(500);
      await this._findAndTap(serial, YT.PLAY_PAUSE, 0);
    } catch (err) {
      try {
        const res = await this.xiaowei.adbShell(serial, "dumpsys media_session | grep -E 'state='");
        const output = _extractShellOutput(res);
        if (output && output.includes("state=2")) {
          await this._findAndTap(serial, YT.PLAYER, 0);
          await _sleep(500);
          await this._findAndTap(serial, YT.PLAY_PAUSE, 0);
        }
      } catch {}
    }
  }

  async _updateJobAssignment(assignmentId, status, extra = {}) {
    const { error } = await this.supabaseSync.supabase
      .from("job_assignments")
      .update({ status, ...extra })
      .eq("id", assignmentId);
    if (error) {
      log.error(`[TaskExecutor] Failed to update job_assignment ${assignmentId} → ${status}: ${error.message}`);
      return false;
    }
    return true;
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
    log.info(`[Engagement] ${serial.substring(0, 6)} personality: ${selectedType}`);
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
   * @param {string} serial
   * @returns {Promise<boolean>}
   */
  async _doLike(serial) {
    try {
      const screen = await this._getScreenSize(serial);
      const midX = Math.round(screen.width / 2);
      const fromY = Math.round(screen.height * 0.6);
      const toY = Math.round(screen.height * 0.4);
      await this.xiaowei.adbShell(serial, `input swipe ${midX} ${fromY} ${midX} ${toY} ${_randInt(300, 600)}`);
      await _sleep(_randInt(800, 1500));

      const tapped = await this._findAndTap(serial, YT.LIKE_BUTTON, 1);
      if (!tapped) {
        log.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} like button not found`);
        return false;
      }
      await _sleep(_randInt(500, 1000));
      log.info(`[Engagement] 👍 ${serial.substring(0, 6)} liked`);

      await this.xiaowei.adbShell(serial, `input swipe ${midX} ${toY} ${midX} ${fromY} ${_randInt(300, 600)}`);
      await _sleep(_randInt(500, 1000));
      return true;
    } catch (err) {
      log.warn(`[Engagement] ✗ ${serial.substring(0, 6)} like failed: ${err.message}`);
      return false;
    }
  }

  /**
   * 구독 실행. 이미 구독 중이면 스킵. SUBSCRIBE_BUTTON 또는 contentDesc "구독" 터치.
   * @param {string} serial
   * @returns {Promise<boolean>}
   */
  async _doSubscribe(serial) {
    try {
      const alreadySubscribed = await this._hasElement(serial, YT.SUBSCRIBE_TEXT);
      if (alreadySubscribed) {
        log.info(`[Engagement] 🔔 ${serial.substring(0, 6)} already subscribed, skip`);
        return false;
      }
      let tapped = await this._findAndTap(serial, YT.SUBSCRIBE_BUTTON, 1);
      if (!tapped) {
        tapped = await this._findAndTap(serial, { contentDesc: "구독" }, 1);
      }
      if (!tapped) {
        log.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} subscribe button not found`);
        return false;
      }
      await _sleep(_randInt(1000, 2000));
      const subscribed = await this._hasElement(serial, YT.SUBSCRIBE_TEXT);
      if (subscribed) {
        log.info(`[Engagement] 🔔 ${serial.substring(0, 6)} subscribed!`);
        return true;
      }
      log.info(`[Engagement] 🔔 ${serial.substring(0, 6)} subscribe tapped (unconfirmed)`);
      return true;
    } catch (err) {
      log.warn(`[Engagement] ✗ ${serial.substring(0, 6)} subscribe failed: ${err.message}`);
      return false;
    }
  }

  /**
   * 댓글 작성 실행. 스크롤 → 입력창 터치 → _inputText → 등록 버튼 → 스크롤 복귀.
   * @param {string} serial - 디바이스 시리얼
   * @param {string} commentText - 작성할 댓글 텍스트
   * @returns {Promise<boolean>} 성공 여부
   */
  async _doComment(serial, commentText) {
    try {
      const screen = await this._getScreenSize(serial);
      const midX = Math.round(screen.width / 2);

      for (let i = 0; i < 3; i++) {
        await this.xiaowei.adbShell(
          serial,
          `input swipe ${midX} ${Math.round(screen.height * 0.7)} ${midX} ${Math.round(screen.height * 0.3)} ${_randInt(400, 700)}`
        );
        await _sleep(_randInt(600, 1000));
      }
      await _sleep(_randInt(1000, 1500));

      let found = await this._findAndTap(serial, YT.COMMENT_INPUT, 2);
      if (!found) found = await this._findAndTap(serial, YT.COMMENT_INPUT_ALT, 1);
      if (!found) {
        log.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} comment input not found`);
        await this._scrollBackToVideo(serial, screen);
        return false;
      }
      await _sleep(_randInt(1000, 2000));

      await this._inputText(serial, commentText);
      await _sleep(_randInt(1000, 2500));

      let posted = await this._findAndTap(serial, YT.COMMENT_POST, 2);
      if (!posted) posted = await this._findAndTap(serial, YT.COMMENT_POST_ALT, 1);
      if (!posted) {
        log.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} comment post button not found`);
        await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_BACK");
        await _sleep(500);
        await this._scrollBackToVideo(serial, screen);
        return false;
      }

      await _sleep(_randInt(2000, 3000));
      log.info(`[Engagement] 💬 ${serial.substring(0, 6)} commented: "${commentText.substring(0, 30)}..."`);

      await this._scrollBackToVideo(serial, screen);
      return true;
    } catch (err) {
      log.warn(`[Engagement] ✗ ${serial.substring(0, 6)} comment failed: ${err.message}`);
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
      await _sleep(_randInt(400, 700));
    }
    await _sleep(_randInt(500, 1000));
  }

  /**
   * 재생목록에 저장 실행. 저장 버튼 → "나중에 볼 동영상" 또는 첫 번째 항목 선택.
   * @param {string} serial
   * @returns {Promise<boolean>}
   */
  async _doSavePlaylist(serial) {
    try {
      let found = await this._findAndTap(serial, YT.SAVE_PLAYLIST, 1);
      if (!found) found = await this._findAndTap(serial, YT.SAVE_PLAYLIST_ALT, 1);
      if (!found) {
        log.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} playlist save button not found`);
        return false;
      }
      await _sleep(_randInt(1500, 2500));

      const selected = await this._findAndTap(serial, YT.WATCH_LATER, 1);
      if (selected) {
        await _sleep(_randInt(1000, 1500));
        log.info(`[Engagement] 📋 ${serial.substring(0, 6)} saved to Watch Later`);
      } else {
        const screen = await this._getScreenSize(serial);
        await this.xiaowei.adbShell(
          serial,
          `input tap ${Math.round(screen.width / 2)} ${Math.round(screen.height * 0.4)}`
        );
        await _sleep(_randInt(1000, 1500));
        log.info(`[Engagement] 📋 ${serial.substring(0, 6)} saved to playlist (first option)`);
      }
      return true;
    } catch (err) {
      log.warn(`[Engagement] ✗ ${serial.substring(0, 6)} playlist save failed: ${err.message}`);
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
      log.info(`[Warmup] 🔥 ${serial.substring(0, 6)} starting warmup (${durationSec}s)`);
      const screen = await this._getScreenSize(serial);
      const midX = Math.round(screen.width / 2);

      await this.xiaowei.adbShell(serial, "am force-stop com.google.android.youtube");
      await _sleep(1000);
      await this.xiaowei.adbShell(serial, "monkey -p com.google.android.youtube -c android.intent.category.LAUNCHER 1");
      await _sleep(_randInt(3000, 5000));

      await this._findAndTap(serial, YT.BOTTOM_NAV_HOME, 0);
      await _sleep(_randInt(1500, 2500));

      const scrollCount = _randInt(2, 4);
      for (let i = 0; i < scrollCount; i++) {
        await this.xiaowei.adbShell(
          serial,
          `input swipe ${midX} ${Math.round(screen.height * 0.7)} ${midX} ${Math.round(screen.height * 0.3)} ${_randInt(500, 900)}`
        );
        await _sleep(_randInt(1500, 3000));
      }

      const startTime = Date.now();
      const targetMs = durationSec * 1000;
      let videosWatched = 0;

      while (Date.now() - startTime < targetMs && videosWatched < 3) {
        const tapY = Math.round(screen.height * (_randInt(35, 65) / 100));
        await this.xiaowei.adbShell(serial, `input tap ${midX} ${tapY}`);
        await _sleep(_randInt(3000, 5000));

        await this._trySkipAd(serial);
        await _sleep(1000);
        await this._ensurePlaying(serial);

        const watchTime = _randInt(30, 90) * 1000;
        const remaining = targetMs - (Date.now() - startTime);
        const actualWatch = Math.min(watchTime, remaining);

        if (actualWatch <= 0) break;

        let watched = 0;
        while (watched < actualWatch) {
          await _sleep(5000);
          watched += 5000;
          if (watched % 15000 < 5000) await this._trySkipAd(serial);
          if (watched % 30000 < 5000) await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_WAKEUP");
        }

        videosWatched++;
        log.info(
          `[Warmup] ${serial.substring(0, 6)} watched video #${videosWatched} (${Math.round(actualWatch / 1000)}s)`
        );

        if (Math.random() < 0.5 && Date.now() - startTime < targetMs) {
          await this.xiaowei.adbShell(
            serial,
            `input swipe ${midX} ${Math.round(screen.height * 0.7)} ${midX} ${Math.round(screen.height * 0.3)} ${_randInt(400, 700)}`
          );
          await _sleep(_randInt(1000, 2000));
          await this._findAndTap(serial, YT.RELATED_VIDEO, 0);
          await _sleep(_randInt(3000, 5000));
        } else {
          await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_BACK");
          await _sleep(_randInt(1500, 2500));
          await this.xiaowei.adbShell(
            serial,
            `input swipe ${midX} ${Math.round(screen.height * 0.7)} ${midX} ${Math.round(screen.height * 0.3)} ${_randInt(500, 900)}`
          );
          await _sleep(_randInt(1500, 2500));
        }
      }

      await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_HOME");
      await _sleep(500);
      log.info(
        `[Warmup] ✓ ${serial.substring(0, 6)} warmup done (${videosWatched} videos, ${Math.round((Date.now() - startTime) / 1000)}s)`
      );
    } catch (err) {
      log.error(`[Warmup] ✗ ${serial.substring(0, 6)} warmup error: ${err.message}`);
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
      log.info(
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

    log.info(`[TaskExecutor] ▶ ${task.id} (${taskType})`);

    try {
      // 1. Mark as running
      await this.supabaseSync.updateTaskStatus(task.id, "running", null, null);

      const timeoutMs = this.config?.taskExecutionTimeoutMs ?? 300000; // 5 min default
      const work = (async () => {
        // 2. Check Xiaowei connection
        if (!this.xiaowei.connected) {
          throw new Error("Xiaowei is not connected");
        }

        // 3. Fetch per-device configs from job_assignments only for task types that use them (skip for adb_shell, adb, etc.)
        const deviceConfigs = _taskTypeUsesJobAssignments(taskType)
          ? await this._fetchDeviceConfigs(task.id)
          : new Map();

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
        log.info(`[TaskExecutor] ✓ ${task.id} completed (${durationSec}s)${summary ? ` — ${summary}` : ""}`);
      })();

      await _withTimeout(work, timeoutMs);
    } catch (err) {
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      this.stats.failed++;
      log.error(`[TaskExecutor] ✗ ${task.id} failed: ${err.message} (${durationSec}s)`);

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
        .from("job_assignments")
        .select("*")
        .eq("job_id", taskId);

      if (error) {
        log.warn(`[TaskExecutor] Failed to fetch job_assignments: ${error.message}`);
        return new Map();
      }

      if (!data || data.length === 0) {
        return new Map();
      }

      const configs = new Map();
      for (const row of data) {
        const serial = row.device_serial || row.device_id;
        if (serial && row.video_url && row.video_id) {
          configs.set(serial, { video_url: row.video_url, video_id: row.video_id });
        }
      }

      log.info(`[TaskExecutor] Loaded ${configs.size} per-device configs`);
      return configs;
    } catch (err) {
      log.warn(`[TaskExecutor] job_assignments query failed — skipping (${err.message})`);
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
        log.warn(`[TaskExecutor] Failed to increment play_count for video ${videoId}: ${error.message}`);
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
        log.info(`[TaskExecutor]   Xiaowei actionCreate: ${actionName} → ${devices}`);
        return this.xiaowei.actionCreate(devices, actionName, options);
      }

      case "like": {
        const actionName = payload.actionName || "YouTube_좋아요";
        log.info(`[TaskExecutor]   Xiaowei actionCreate: ${actionName} → ${devices}`);
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
        log.info(`[TaskExecutor]   Xiaowei actionCreate: ${payload.actionName} → ${devices}`);
        return this.xiaowei.actionCreate(devices, payload.actionName, options);

      case "script":
        if (!payload.scriptPath) {
          throw new Error("scriptPath is required for script type");
        }
        log.info(`[TaskExecutor]   Xiaowei autojsCreate: ${payload.scriptPath} → ${devices}`);
        return this.xiaowei.autojsCreate(devices, payload.scriptPath, options);

      case "adb":
        if (!payload.command) {
          throw new Error("command is required for adb type");
        }
        log.info(`[TaskExecutor]   Xiaowei adb: "${payload.command}" → ${devices}`);
        return this.xiaowei.adb(devices, payload.command);

      case "adb_shell":
        if (!payload.command) {
          throw new Error("command is required for adb_shell type");
        }
        log.info(`[TaskExecutor]   Xiaowei adbShell: "${payload.command}" → ${devices}`);
        return this.xiaowei.adbShell(devices, payload.command);

      case "start_app":
        if (!payload.packageName) {
          throw new Error("packageName is required for start_app type");
        }
        log.info(`[TaskExecutor]   Xiaowei startApk: ${payload.packageName} → ${devices}`);
        return this.xiaowei.startApk(devices, payload.packageName);

      case "stop_app":
        if (!payload.packageName) {
          throw new Error("packageName is required for stop_app type");
        }
        log.info(`[TaskExecutor]   Xiaowei stopApk: ${payload.packageName} → ${devices}`);
        return this.xiaowei.stopApk(devices, payload.packageName);

      case "install_apk":
        if (!payload.filePath) {
          throw new Error("filePath is required for install_apk type");
        }
        log.info(`[TaskExecutor]   Xiaowei installApk: ${payload.filePath} → ${devices}`);
        return this.xiaowei.installApk(devices, payload.filePath);

      case "screenshot":
        log.info(`[TaskExecutor]   Xiaowei screen → ${devices}`);
        return this.xiaowei.screen(devices, payload.savePath);

      case "push_event":
        if (payload.type == null || payload.type === undefined) {
          throw new Error("type is required for push_event (0=back, 1=home, 2=recents)");
        }
        log.info(`[TaskExecutor]   Xiaowei pushEvent: type=${payload.type} → ${devices}`);
        return this.xiaowei.pushEvent(devices, String(payload.type));

      case "run_script":
        if (!payload.scriptPath) {
          throw new Error("scriptPath is required for run_script type");
        }
        const runScriptPath = this._resolveScriptPath(payload.scriptPath);
        log.info(`[TaskExecutor]   Xiaowei autojsCreate: ${payload.scriptPath} → ${devices}`);
        return this.xiaowei.autojsCreate(devices, runScriptPath, options);

      case "actionCreate":
        if (!payload.actionName) {
          throw new Error("actionName is required for actionCreate type");
        }
        log.info(`[TaskExecutor]   Xiaowei actionCreate: ${payload.actionName} → ${devices}`);
        return this.xiaowei.actionCreate(devices, payload.actionName, options);

      default:
        throw new Error(`Unknown task type: ${taskType}`);
    }
  }

  async _executeWatchVideo(devices, payload, options, deviceConfigs) {
    // If we have per-device configs (batch task), execute individually for each device
    if (deviceConfigs && deviceConfigs.size > 0) {
      log.info(`[TaskExecutor]   Batch execution: ${deviceConfigs.size} devices with individual videos`);
      const results = [];

      for (const [deviceSerial, config] of deviceConfigs) {
        const devicePayload = { ...payload, video_url: config.video_url };
        log.info(`[TaskExecutor]   Device ${deviceSerial} → ${config.video_url}`);

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
      log.info(`[TaskExecutor]   Xiaowei actionCreate: ${payload.actionName} → ${devices}`);
      return this.xiaowei.actionCreate(devices, payload.actionName, options);
    }

    const scriptName = payload.scriptPath || "youtube_watch.js";
    const scriptPath = this._resolveScriptPath(scriptName);
    log.info(`[TaskExecutor]   Xiaowei autojsCreate: ${scriptName} → ${devices}`);
    return this.xiaowei.autojsCreate(devices, scriptPath, {
      ...options,
      taskInterval: payload.taskInterval || [2000, 5000],
      deviceInterval: payload.deviceInterval || "1000",
    });
  }

  async _executeComment(devices, payload, options) {
    if (payload.scriptPath) {
      const scriptPath = this._resolveScriptPath(payload.scriptPath);
      log.info(`[TaskExecutor]   Xiaowei autojsCreate: ${payload.scriptPath} → ${devices}`);
      return this.xiaowei.autojsCreate(devices, scriptPath, options);
    }

    const actionName = payload.actionName || "YouTube_댓글";
    log.info(`[TaskExecutor]   Xiaowei actionCreate: ${actionName} → ${devices}`);
    return this.xiaowei.actionCreate(devices, actionName, options);
  }

  async _executeCustom(devices, payload, options) {
    if (!payload.scriptPath) {
      throw new Error("scriptPath is required for custom task type");
    }
    const scriptPath = this._resolveScriptPath(payload.scriptPath);
    log.info(`[TaskExecutor]   Xiaowei autojsCreate: ${payload.scriptPath} → ${devices}`);
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
  if (!result) return null;
  if (typeof result === "string") return result.substring(0, 100);

  // Common Xiaowei response patterns
  if (result.msg) return String(result.msg).substring(0, 100);
  if (result.message) return String(result.message).substring(0, 100);
  if (result.status) return `status=${result.status}`;
  if (result.code !== undefined) return `code=${result.code}`;
  if (result.success !== undefined) return result.success ? "success=true" : "success=false";

  return null;
}

module.exports = TaskExecutor;
