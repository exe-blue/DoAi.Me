/**
 * DoAi.Me - Video Dispatcher
 * Creates jobs + job_assignments from active videos that don't have a job yet.
 * Runs every 60s; uses videos.id (YouTube Video ID) for YouTube URL.
 */
class VideoDispatcher {
  constructor(supabaseSync, config, broadcaster) {
    this.supabase = supabaseSync.supabase;
    this.pcId = supabaseSync.pcId;
    this.config = config;
    this.broadcaster = broadcaster;
    this._interval = null;
    this._running = false;
    this._intervalMs = 60000;
    this._firstRunDelayMs = 30000;
  }

  start() {
    console.log(`[VideoDispatcher] Started (${this._intervalMs / 1000}s interval)`);
    this._interval = setInterval(() => this._tick(), this._intervalMs);
    setTimeout(() => this._tick(), this._firstRunDelayMs);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    console.log("[VideoDispatcher] Stopped");
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

  async _processNewVideos() {
    // 1. Get active videos (id = YouTube Video ID, duration_sec)
    const { data: videos, error: vErr } = await this.supabase
      .from("videos")
      .select("id, title, status, duration_sec")
      .eq("status", "active");

    if (vErr) {
      console.warn(`[VideoDispatcher] videos query failed: ${vErr.message}`);
      return;
    }
    if (!videos || videos.length === 0) return;

    // 2. Get existing active jobs (match by target_url containing video id)
    const { data: existingJobs } = await this.supabase
      .from("jobs")
      .select("id, target_url, total_assignments, is_active")
      .eq("is_active", true);

    const jobMap = new Map();
    for (const job of existingJobs || []) {
      const vid = extractVideoId(job.target_url);
      if (vid) jobMap.set(vid, job);
    }

    // 3. Get this PC's online devices
    const { data: devices } = await this.supabase
      .from("devices")
      .select("id, serial_number")
      .eq("pc_id", this.pcId)
      .in("status", ["online", "busy"]);

    if (!devices || devices.length === 0) return;

    const targetViewsDefault = 100;
    let created = 0;

    for (const video of videos) {
      const youtubeUrl = `https://www.youtube.com/watch?v=${video.id}`;

      const existingJob = jobMap.get(video.id) || null;

      if (existingJob) {
        const targetViews = targetViewsDefault;

        const { count: completedCount } = await this.supabase
          .from("job_assignments")
          .select("id", { count: "exact", head: true })
          .eq("job_id", existingJob.id)
          .eq("status", "completed");

        if ((completedCount || 0) >= targetViews) continue;

        const { count: activeCount } = await this.supabase
          .from("job_assignments")
          .select("id", { count: "exact", head: true })
          .eq("job_id", existingJob.id)
          .in("status", ["pending", "running"]);

        if ((activeCount || 0) >= devices.length) continue;

        const { data: assignedRows } = await this.supabase
          .from("job_assignments")
          .select("device_id")
          .eq("job_id", existingJob.id)
          .in("status", ["pending", "running"]);

        const assignedIds = new Set((assignedRows || []).map((a) => a.device_id));
        const unassigned = devices.filter((d) => !assignedIds.has(d.id));

        if (unassigned.length > 0) {
          const newAssignments = unassigned.map((d) => ({
            job_id: existingJob.id,
            device_id: d.id,
            device_serial: d.serial_number,
            status: "pending",
            progress_pct: 0,
          }));

          const { error: assignErr } = await this.supabase
            .from("job_assignments")
            .insert(newAssignments);

          if (!assignErr) {
            console.log(`[VideoDispatcher] +${unassigned.length} assignments for "${video.title}"`);
          }
        }
        continue;
      }

      // No job — create job + assignments
      const durationSec = video.duration_sec || 60;

      const { data: job, error: jobErr } = await this.supabase
        .from("jobs")
        .insert({
          title: `Auto: ${video.title || "Untitled"}`,
          target_url: youtubeUrl,
          video_url: youtubeUrl,
          script_type: "youtube_watch",
          duration_sec: durationSec,
          duration_min_pct: 30,
          duration_max_pct: 90,
          prob_like: 0,
          prob_comment: 0,
          prob_playlist: 0,
          is_active: true,
          total_assignments: devices.length,
        })
        .select("id")
        .single();

      if (jobErr) {
        console.error(`[VideoDispatcher] Failed to create job for "${video.title}": ${jobErr.message}`);
        continue;
      }

      const assignments = devices.map((d) => ({
        job_id: job.id,
        device_id: d.id,
        device_serial: d.serial_number,
        status: "pending",
        progress_pct: 0,
      }));

      const { error: assignErr } = await this.supabase
        .from("job_assignments")
        .insert(assignments);

      if (assignErr) {
        console.error(`[VideoDispatcher] Failed to create assignments: ${assignErr.message}`);
        continue;
      }

      created++;
      console.log(`[VideoDispatcher] Created job + ${devices.length} assignments for "${video.title}"`);

      if (this.broadcaster && typeof this.broadcaster.publishSystemEvent === "function") {
        try {
          await this.broadcaster.publishSystemEvent(
            "video_job_created",
            `New job created for "${video.title}" with ${devices.length} device(s)`,
            { video_id: video.id, job_id: job.id, device_count: devices.length }
          );
        } catch (e) {
          // ignore broadcast errors
        }
      }
    }

    if (created > 0) {
      console.log(`[VideoDispatcher] Created ${created} new job(s) this cycle`);
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
