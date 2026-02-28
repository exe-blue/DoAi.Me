/**
 * agent/video-manager/models.js — Supabase CRUD for videos + channels tables
 *
 * 실제 스키마 (WEBAPP_SCHEMA_FIX.md 기준):
 *   videos: { id (YouTube Video ID, text PK), title, channel_id, channel_name,
 *     status (active|paused|completed|archived), target_views, completed_views,
 *     failed_views, duration_sec, search_keyword, priority, tags, ... }
 *   channels: { id (YouTube Channel ID, text PK), name, handle, subscriber_count,
 *     video_count, is_monitored, status, ... }
 *
 * 워밍업 영상: videos.tags에 'warmup' 포함 OR status='active' + 낮은 priority
 * 미션 영상: videos.status='active' + target_views 설정됨
 */
const { getLogger } = require('../common/logger');
const log = getLogger('video-manager.models');

let _supabase = null;
function _db() {
  if (!_supabase) throw new Error('video-manager/models not initialized');
  return _supabase;
}

const videoModels = {
  init(supabase) { _supabase = supabase; },

  async getById(videoId) {
    const { data, error } = await _db().from('videos').select('*').eq('id', videoId).maybeSingle();
    if (error) { log.error('get_failed', { videoId, error: error.message }); return null; }
    return data;
  },

  /** 활성 미션 영상 (target_views 미달성, priority 높은 순) */
  async getActiveMissions(limit = 10) {
    const { data, error } = await _db()
      .from('videos')
      .select('*')
      .eq('status', 'active')
      .order('priority', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) { log.error('active_missions_failed', { error: error.message }); return []; }

    // target_views 미달성 필터
    return (data || []).filter(v => {
      const target = v.target_views || 0;
      const done = v.completed_views || 0;
      return target === 0 || done < target;
    });
  },

  /** 다음 미션 1개 (우선순위 + 미달성) */
  async getNextMission() {
    const missions = await this.getActiveMissions(1);
    return missions.length > 0 ? missions[0] : null;
  },

  /** 영상 등록/업데이트 (video_id = YouTube ID, text PK) */
  async upsert(videoId, fields) {
    const row = { id: videoId, ...fields };
    const { error } = await _db()
      .from('videos')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      log.error('upsert_failed', { videoId, error: error.message });
      return false;
    }
    return true;
  },

  /** 벌크 등록 */
  async bulkUpsert(videos) {
    if (!videos || videos.length === 0) return 0;
    const { error } = await _db().from('videos').upsert(videos, { onConflict: 'id' });
    if (error) { log.error('bulk_upsert_failed', { count: videos.length, error: error.message }); return 0; }
    return videos.length;
  },

  /** 시청 완료 카운트 증가 */
  async incrementViews(videoId) {
    const video = await this.getById(videoId);
    if (!video) return;
    const { error } = await _db()
      .from('videos')
      .update({ completed_views: (video.completed_views || 0) + 1 })
      .eq('id', videoId);
    if (error) log.error('increment_views_failed', { videoId, error: error.message });
  },

  /** 좋아요/댓글/구독 등 개별 카운트 업데이트는 job_assignments에서 추적 */

  /** 미션 완료 체크 + 상태 업데이트 */
  async checkAndComplete(videoId) {
    const video = await this.getById(videoId);
    if (!video || !video.target_views) return false;

    if ((video.completed_views || 0) >= video.target_views) {
      await _db().from('videos').update({ status: 'completed' }).eq('id', videoId);
      log.info('mission_completed', { videoId, target: video.target_views, actual: video.completed_views });
      return true;
    }
    return false;
  },

  /** 상태 업데이트 */
  async updateStatus(videoId, status) {
    const { error } = await _db().from('videos').update({ status }).eq('id', videoId);
    if (error) log.error('status_update_failed', { videoId, status, error: error.message });
  },

  /** 채널별 영상 목록 */
  async listByChannel(channelId, limit = 20) {
    const { data, error } = await _db()
      .from('videos')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data || [];
  },
};

const channelModels = {
  init(supabase) { _supabase = supabase; },

  async getById(channelId) {
    const { data, error } = await _db().from('channels').select('*').eq('id', channelId).maybeSingle();
    if (error) return null;
    return data;
  },

  async upsert(channelId, fields) {
    const row = { id: channelId, ...fields };
    const { error } = await _db().from('channels').upsert(row, { onConflict: 'id' });
    if (error) { log.error('channel_upsert_failed', { channelId, error: error.message }); return false; }
    return true;
  },

  /** 모니터링 대상 채널 */
  async listMonitored() {
    const { data, error } = await _db()
      .from('channels')
      .select('*')
      .eq('is_monitored', true);
    if (error) return [];
    return data || [];
  },
};

module.exports = { videoModels, channelModels };
