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
    console.log("[VideoDispatcher] Skipped: job_assignments system has been replaced by the task_devices pipeline. Use the web dashboard to create tasks.");
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
