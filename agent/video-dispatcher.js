/**
 * DoAi.Me - Video Dispatcher (Push-based)
 * Creates jobs + job_assignments from active videos.
 * Primary: Supabase Realtime → immediate processing on INSERT/UPDATE.
 * Fallback: 60s poll for any missed events.
 * Emits 'nudge' when new assignments are created so DeviceOrchestrator can act immediately.
 */
const EventEmitter = require("events");

class VideoDispatcher extends EventEmitter {
  constructor(supabaseSync, config, broadcaster) {
    super();
    this.supabase = supabaseSync.supabase;
    this.pcId = supabaseSync.pcId;
    this.config = config;
    this.broadcaster = broadcaster;
    this._interval = null;
    this._running = false;
    this._intervalMs = 60000;
    this._firstRunDelayMs = 5000;
    this._videoChannel = null;
    this._assignChannel = null;
    this._placeholderDeviceId = null;
  }

  start() {
    console.log(`[VideoDispatcher] Started (Realtime push + ${this._intervalMs / 1000}s fallback)`);
    this._interval = setInterval(() => this._tick(), this._intervalMs);
    setTimeout(() => this._tick(), this._firstRunDelayMs);
    this._subscribeToVideoChanges();
    this._subscribeToCompletedAssignments();
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    if (this._videoChannel) {
      this.supabase.removeChannel(this._videoChannel);
      this._videoChannel = null;
    }
    if (this._assignChannel) {
      this.supabase.removeChannel(this._assignChannel);
      this._assignChannel = null;
    }
    console.log("[VideoDispatcher] Stopped");
  }

  /**
   * Realtime: videos INSERT/UPDATE where status='active' → immediate job + assignment creation
   */
  _subscribeToVideoChanges() {
    this._videoChannel = this.supabase
      .channel("vd-videos-push")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "videos",
        filter: "status=eq.active",
      }, async (payload) => {
        const video = payload.new;
        if (!video || !video.id) return;
        console.log(`[VideoDispatcher] ⚡ Realtime: "${video.title || video.id}" → immediate processing`);
        try {
          await this._ensurePlaceholderDevice();
          const created = await this._processOneVideo(video);
          if (created > 0) this.emit("nudge");
        } catch (err) {
          console.error(`[VideoDispatcher] Realtime handler error: ${err.message}`);
        }
      })
      .subscribe((status) => {
        console.log(`[VideoDispatcher] videos Realtime: ${status}`);
      });
  }

  /**
   * Realtime: job_assignments completed → refill pool immediately
   */
  _subscribeToCompletedAssignments() {
    this._assignChannel = this.supabase
      .channel("vd-assign-complete")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "job_assignments",
        filter: `pc_id=eq.${this.pcId}`,
      }, async (payload) => {
        const row = payload.new;
        if (!row || (row.status !== "completed" && row.status !== "failed")) return;
        try {
          await this._ensurePlaceholderDevice();
          const refilled = await this._refillForJob(row.job_id, row.video_id);
          if (refilled > 0) this.emit("nudge");
        } catch (err) {
          console.error(`[VideoDispatcher] Refill error: ${err.message}`);
        }
      })
      .subscribe((status) => {
        console.log(`[VideoDispatcher] assignments Realtime: ${status}`);
      });
  }

  async _tick() {
    if (this._running) return;
    this._running = true;
    try {
      await this._processNewVideos();
    } catch (err) {
      console.error(`[VideoDispatcher] Error: ${err.message}`);
    } finally {
      this._running = false;
    }
  }

  async _ensurePlaceholderDevice() {
    if (this._placeholderDeviceId) return;
    const { data: devices } = await this.supabase
      .from("devices")
      .select("id")
      .eq("pc_id", this.pcId)
      .limit(1);
    this._placeholderDeviceId = devices && devices[0] ? devices[0].id : null;
  }

  /**
   * Process a single video: ensure job exists, refill assignment pool.
   * Used by both Realtime handler and bulk _processNewVideos.
   * @returns {number} assignments created
   */
  async _processOneVideo(video) {
    const targetViewsDefault = 100;
    const poolBatchSize = 30;
    const targetViews = video.target_views != null ? video.target_views : targetViewsDefault;
    const completedViews = video.completed_views != null ? video.completed_views : 0;
    if (completedViews >= targetViews) return 0;

    const youtubeUrl = `https://www.youtube.com/watch?v=${video.id}`;

    // Check existing job
    const { data: existingJob } = await this.supabase
      .from("jobs")
      .select("id")
      .eq("target_url", youtubeUrl)
      .eq("is_active", true)
      .maybeSingle();

    if (existingJob) {
      return this._refillForJob(existingJob.id, video.id);
    }

    // Create new job + initial pool
    const durationSec = video.duration_sec || 60;
    const { data: job, error: jobErr } = await this.supabase
      .from("jobs")
      .insert({
        title: `Auto: ${video.title || "Untitled"}`,
        target_url: youtubeUrl,
        video_url: youtubeUrl,
        keyword: (video.title || "").replace(/#\S+/g, "").trim().substring(0, 50) || null,
        video_title: video.title || null,
        script_type: "youtube_watch",
        duration_sec: durationSec,
        duration_min_pct: 30,
        duration_max_pct: 90,
        prob_like: 0,
        prob_comment: 0,
        prob_playlist: 0,
        is_active: true,
        total_assignments: 0,
      })
      .select("id")
      .single();

    if (jobErr) {
      console.error(`[VideoDispatcher] Job creation failed for "${video.title}": ${jobErr.message}`);
      return 0;
    }

    const needed = targetViews - completedViews;
    const toCreate = Math.min(needed, poolBatchSize);
    const assignments = Array.from({ length: toCreate }, () => ({
      job_id: job.id,
      device_id: this._placeholderDeviceId,
      device_serial: null,
      pc_id: this.pcId,
      video_id: video.id,
      status: "pending",
      progress_pct: 0,
    }));

    const { error: assignErr } = await this.supabase
      .from("job_assignments")
      .insert(assignments);

    if (assignErr) {
      console.error(`[VideoDispatcher] Assignment insert failed: ${assignErr.message}`);
      return 0;
    }

    console.log(`[VideoDispatcher] ⚡ Created job + ${toCreate} assignments for "${video.title}"`);

    if (this.broadcaster && typeof this.broadcaster.publishSystemEvent === "function") {
      this.broadcaster.publishSystemEvent(
        "video_job_created",
        `New job for "${video.title}" with ${toCreate} assignment(s)`,
        { video_id: video.id, job_id: job.id, device_count: toCreate }
      ).catch(() => {});
    }

    return toCreate;
  }

  /**
   * Refill pending assignments for a specific job up to pool target.
   * Called on assignment completion (Realtime) and during bulk tick.
   * @returns {number} assignments created
   */
  async _refillForJob(jobId, videoId) {
    if (!jobId) return 0;
    const poolBatchSize = 30;

    const { count: activeCount } = await this.supabase
      .from("job_assignments")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .in("status", ["pending", "running"]);

    // Keep at least 10 pending per job (or up to target_views)
    const minPool = 10;
    const needed = minPool - (activeCount || 0);
    if (needed <= 0) return 0;

    const toCreate = Math.min(needed, poolBatchSize);
    const assignments = Array.from({ length: toCreate }, () => ({
      job_id: jobId,
      device_id: this._placeholderDeviceId,
      device_serial: null,
      pc_id: this.pcId,
      video_id: videoId,
      status: "pending",
      progress_pct: 0,
    }));

    const { error } = await this.supabase.from("job_assignments").insert(assignments);
    if (error) {
      console.warn(`[VideoDispatcher] Refill failed for job ${jobId}: ${error.message}`);
      return 0;
    }

    console.log(`[VideoDispatcher] ↻ Refilled +${toCreate} assignments (job ${String(jobId).substring(0, 8)})`);
    return toCreate;
  }

  /**
   * Bulk fallback: process all active videos (runs every 60s)
   */
  async _processNewVideos() {
    const { data: videos, error: vErr } = await this.supabase
      .from("videos")
      .select("id, title, status, duration_sec, target_views, completed_views")
      .eq("status", "active");

    if (vErr) {
      console.warn(`[VideoDispatcher] videos query failed: ${vErr.message}`);
      return;
    }
    if (!videos || videos.length === 0) return;

    await this._ensurePlaceholderDevice();

    let totalCreated = 0;
    for (const video of videos) {
      const created = await this._processOneVideo(video);
      totalCreated += created;
    }

    if (totalCreated > 0) {
      console.log(`[VideoDispatcher] Bulk: +${totalCreated} assignments this cycle`);
      this.emit("nudge");
    }
  }
}

function extractVideoId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0];
    return u.searchParams.get("v") || null;
  } catch {
    return null;
  }
}

module.exports = VideoDispatcher;
