# video-dispatcher.js 신규 생성 지시서

## 목적
`videos` 테이블에 새로 들어온 (또는 active 상태인) 영상 중 아직 `jobs`가 생성되지 않은 것을 자동으로 감지하여 `jobs` + `job_assignments` 레코드를 생성하는 Agent 컴포넌트.

## 위치
`agent/video-dispatcher.js` (새 파일)

## 동작 주기
- 60초마다 체크 (configurable)
- agent.js에서 초기화 + start()

## 로직

```
매 60초:
  1. videos 테이블에서 status='active' 영상 조회
  2. 각 영상에 대해 jobs 테이블에 해당 video의 target_url로 된 active job이 있는지 확인
  3. job이 없으면:
     a. jobs 테이블에 새 job INSERT
     b. 이 PC의 online devices 목록 조회
     c. 각 device에 대해 job_assignments INSERT (status='pending')
  4. 이미 job이 있지만 completed assignments < target_views 이면:
     → 추가 assignments 생성 (미달분만큼)
```

## 코드 구조

```javascript
class VideoDispatcher {
  constructor(supabaseSync, config, broadcaster) {
    this.supabase = supabaseSync.supabase;
    this.pcId = supabaseSync.pcId;
    this.config = config;
    this.broadcaster = broadcaster;
    this._interval = null;
    this._running = false;
  }

  start() {
    const interval = 60000; // 60초
    console.log(`[VideoDispatcher] Started (${interval/1000}s interval)`);
    this._interval = setInterval(() => this._tick(), interval);
    // 첫 실행은 30초 후 (heartbeat가 디바이스 등록할 시간)
    setTimeout(() => this._tick(), 30000);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
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
    // 1. Get active videos
    const { data: videos, error: vErr } = await this.supabase
      .from("videos")
      .select("id, title, target_views, completed_views, watch_duration_sec, prob_like, prob_comment, prob_subscribe, status")
      .eq("status", "active");

    if (vErr || !videos || videos.length === 0) return;

    // 2. Get existing active jobs' video references
    //    jobs.target_url에 youtube video id가 포함됨
    const { data: existingJobs } = await this.supabase
      .from("jobs")
      .select("id, target_url, total_assignments, is_active")
      .eq("is_active", true);

    const jobMap = new Map(); // videoId → job
    for (const job of existingJobs || []) {
      // target_url에서 video id 추출
      const vid = extractVideoId(job.target_url);
      if (vid) jobMap.set(vid, job);
    }

    // 3. Get this PC's online devices
    const { data: devices } = await this.supabase
      .from("devices")
      .select("id, serial_number")
      .eq("pc_id", this.pcId)
      .in("status", ["online", "idle"]);

    if (!devices || devices.length === 0) return;

    let created = 0;

    for (const video of videos) {
      const videoId = video.id; // DB UUID
      
      // videos 테이블의 youtube_video_id 또는 id를 기반으로 매칭
      // 여기서는 video.id(UUID)로 job을 찾는 게 정확함
      
      // Check if job already exists for this video
      const { data: existingJob } = await this.supabase
        .from("jobs")
        .select("id, total_assignments")
        .eq("is_active", true)
        .ilike("target_url", `%${video.id}%`)  // or use a video_id FK if available
        .maybeSingle();

      if (existingJob) {
        // Job exists — check if more assignments needed
        const { count: completedCount } = await this.supabase
          .from("job_assignments")
          .select("id", { count: "exact", head: true })
          .eq("job_id", existingJob.id)
          .eq("status", "completed");

        const targetViews = video.target_views || 100;
        if ((completedCount || 0) >= targetViews) continue; // 목표 달성

        // Check if there are already enough pending/running assignments
        const { count: activeCount } = await this.supabase
          .from("job_assignments")
          .select("id", { count: "exact", head: true })
          .eq("job_id", existingJob.id)
          .in("status", ["pending", "running"]);

        if ((activeCount || 0) >= devices.length) continue; // 이미 할당 충분

        // Create additional assignments for unassigned devices
        const { data: assignedDevices } = await this.supabase
          .from("job_assignments")
          .select("device_id")
          .eq("job_id", existingJob.id)
          .in("status", ["pending", "running"]);

        const assignedIds = new Set((assignedDevices || []).map(a => a.device_id));
        const unassigned = devices.filter(d => !assignedIds.has(d.id));

        if (unassigned.length > 0) {
          const newAssignments = unassigned.map(d => ({
            job_id: existingJob.id,
            device_id: d.id,
            device_serial: d.serial_number,
            status: "pending",
            progress_pct: 0,
          }));

          await this.supabase.from("job_assignments").insert(newAssignments);
          console.log(`[VideoDispatcher] +${unassigned.length} assignments for "${video.title}"`);
        }

        continue;
      }

      // No job exists — create new job + assignments
      const youtubeUrl = `https://www.youtube.com/watch?v=${video.id}`;
      // Note: video.id might be UUID, need youtube_video_id
      // Adjust based on actual videos table schema

      const { data: job, error: jobErr } = await this.supabase
        .from("jobs")
        .insert({
          title: `Auto: ${video.title || "Untitled"}`,
          target_url: youtubeUrl,
          video_url: youtubeUrl,
          script_type: "youtube_watch",
          duration_sec: video.watch_duration_sec || 60,
          duration_min_pct: 30,
          duration_max_pct: 90,
          prob_like: video.prob_like || 0,
          prob_comment: video.prob_comment || 0,
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

      // Create assignments for all online devices
      const assignments = devices.map(d => ({
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

      if (this.broadcaster) {
        await this.broadcaster.publishSystemEvent(
          "video_job_created",
          `New job created for "${video.title}" with ${devices.length} device(s)`,
          { video_id: video.id, job_id: job.id, device_count: devices.length }
        );
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
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    return u.searchParams.get("v") || null;
  } catch {
    return null;
  }
}

module.exports = VideoDispatcher;
```

## agent.js 에 추가할 코드

```javascript
// 상단 require
const VideoDispatcher = require("./video-dispatcher");

// 변수 선언
let videoDispatcher = null;

// main() 안에서 (scheduleEvaluator.start() 뒤에):
videoDispatcher = new VideoDispatcher(supabaseSync, config, broadcaster);
videoDispatcher.start();
console.log("[Agent] ✓ Video dispatcher started");

// shutdown() 안에서:
if (videoDispatcher) videoDispatcher.stop();
```

## 중요: videos 테이블 스키마 확인 필요

videos 테이블에 `youtube_video_id` 컬럼이 있으면 job의 target_url을 
`https://www.youtube.com/watch?v=${video.youtube_video_id}` 로 생성해야 함.

현재 코드는 video.id (UUID)를 쓰고 있는데, 실제로는 youtube_video_id를 써야 할 수 있음.
Supabase에서 `SELECT id, youtube_video_id, title FROM videos LIMIT 5;` 로 확인 후 조정.

## 테스트 방법

1. Supabase에서 videos에 테스트 영상 추가:
```sql
INSERT INTO videos (youtube_video_id, title, status, target_views, watch_duration_sec)
VALUES ('dQw4w9WgXcQ', 'Test Video', 'active', 10, 60);
```

2. 60초 기다리면 Agent 로그에:
```
[VideoDispatcher] Created job + 3 assignments for "Test Video"
```

3. 이후 TaskExecutor/Agent가 assignments를 픽업해서 실행