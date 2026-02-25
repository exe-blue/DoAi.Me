/**
 * agent/video-manager/service.js — 영상 풀 관리, 채널 API, 미션 관리
 *
 * YouTube Data API v3 연동, 워밍업 영상 수집, 미션 진행 추적.
 */
const { getLogger } = require('../common/logger');
const { videoModels, channelModels } = require('./models');

const log = getLogger('video-manager.service');

/** YouTube Data API 일일 쿼터 추적 */
let _apiQuotaUsed = 0;
const API_QUOTA_DAILY_LIMIT = 9500; // 안전 마진 (실제 10000)

class VideoManagerService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {string} [youtubeApiKey]
   */
  constructor(supabase, youtubeApiKey) {
    this.supabase = supabase;
    videoModels.init(supabase);
    channelModels.init(supabase);
    this.apiKey = youtubeApiKey || process.env.YOUTUBE_API_KEY || '';
  }

  // ═══════════════════════════════════════════════════════
  // 워밍업 영상 풀
  // ═══════════════════════════════════════════════════════

  /**
   * YouTube Data API로 카테고리별 인기 영상 수집 → videos 테이블 등록
   * @param {string[]} categories - 카테고리 (e.g. ['music', 'news', 'gaming'])
   * @param {number} countPerCategory - 카테고리당 영상 수
   * @returns {Promise<number>} 등록된 영상 수
   */
  async generateWarmupPool(categories = ['music', 'news', 'entertainment'], countPerCategory = 10) {
    if (!this.apiKey) {
      log.warn('no_api_key', { action: 'generate_warmup' });
      return 0;
    }

    const CATEGORY_IDS = {
      music: '10', news: '25', entertainment: '24', gaming: '20',
      sports: '17', education: '27', science: '28', comedy: '23',
      film: '1', people: '22',
    };

    let totalRegistered = 0;

    for (const cat of categories) {
      const catId = CATEGORY_IDS[cat] || '0';
      try {
        const videos = await this._fetchPopularVideos(catId, countPerCategory);
        const rows = videos.map(v => ({
          id: v.id,
          title: v.title,
          channel_id: v.channelId,
          channel_name: v.channelTitle,
          duration_sec: v.durationSec || 60,
          status: 'active',
          priority: 'low',
          tags: ['warmup', cat],
          metadata: { source: 'warmup_pool', category: cat },
        }));

        const count = await videoModels.bulkUpsert(rows);
        totalRegistered += count;
        log.info('warmup_generated', { category: cat, count });
      } catch (err) {
        log.error('warmup_gen_failed', { category: cat, error: err.message });
      }
    }

    return totalRegistered;
  }

  /**
   * 워밍업 영상 1개 반환 (completed_views 낮은 순 = 덜 사용된)
   * @returns {Promise<object|null>}
   */
  async getWarmupVideo() {
    // 워밍업 = tags에 'warmup' 포함 + active
    const { data, error } = await this._db()
      .from('videos')
      .select('*')
      .eq('status', 'active')
      .contains('tags', ['warmup'])
      .order('completed_views', { ascending: true, nullsFirst: true })
      .limit(1);

    if (error || !data || data.length === 0) return null;
    return data[0];
  }

  // ═══════════════════════════════════════════════════════
  // 채널 등록 + 영상 수집
  // ═══════════════════════════════════════════════════════

  /**
   * YouTube Data API로 채널 정보 + 최신 영상 가져와서 등록
   * @param {string} channelId - YouTube Channel ID
   * @returns {Promise<{channel: object, videos: number}>}
   */
  async registerChannel(channelId) {
    if (!this.apiKey) {
      log.warn('no_api_key', { action: 'register_channel' });
      return { channel: null, videos: 0 };
    }

    // 채널 정보
    const channelInfo = await this._fetchChannelInfo(channelId);
    if (channelInfo) {
      await channelModels.upsert(channelId, {
        name: channelInfo.title,
        handle: channelInfo.customUrl || null,
        thumbnail_url: channelInfo.thumbnail || null,
        subscriber_count: channelInfo.subscriberCount || '0',
        video_count: parseInt(channelInfo.videoCount || '0', 10),
        is_monitored: true,
        status: 'active',
      });
    }

    // 최신 영상 목록
    const videos = await this._fetchChannelVideos(channelId, 20);
    const rows = videos.map(v => ({
      id: v.id,
      title: v.title,
      channel_id: channelId,
      channel_name: channelInfo?.title || '',
      duration_sec: v.durationSec || 60,
      status: 'paused', // 수동으로 active 전환
      tags: [],
      metadata: { source: 'channel_register' },
    }));

    const count = await videoModels.bulkUpsert(rows);
    log.info('channel_registered', { channelId, name: channelInfo?.title, videos: count });

    return { channel: channelInfo, videos: count };
  }

  // ═══════════════════════════════════════════════════════
  // 미션 관리
  // ═══════════════════════════════════════════════════════

  /**
   * 미션 생성 (영상에 목표 설정)
   * @param {string} videoId
   * @param {object} targets - { views, likes, comments, subscribes }
   * @param {object} [options] - { priority, searchKeyword, watchDuration }
   */
  async createMission(videoId, targets, options = {}) {
    const update = {
      status: 'active',
      target_views: targets.views || 100,
      completed_views: 0,
      failed_views: 0,
    };
    if (targets.watchDuration) update.watch_duration_sec = targets.watchDuration;
    if (targets.likes) update.prob_like = targets.likes;
    if (targets.comments) update.prob_comment = targets.comments;
    if (targets.subscribes) update.prob_subscribe = targets.subscribes;
    if (options.priority) update.priority = options.priority;
    if (options.searchKeyword) update.search_keyword = options.searchKeyword;

    const ok = await videoModels.upsert(videoId, update);
    if (ok) log.info('mission_created', { videoId, targets, options });
    return ok;
  }

  /** 다음 미션 영상 반환 (우선순위 + 미달성) */
  async getNextMission() {
    return videoModels.getNextMission();
  }

  /**
   * 미션 진행 업데이트 (시청/좋아요/댓글 완료 시)
   * @param {string} videoId
   * @param {string} actionType - 'view' | 'like' | 'comment' | 'subscribe'
   */
  async updateProgress(videoId, actionType) {
    if (actionType === 'view') {
      await videoModels.incrementViews(videoId);
    }
    // 좋아요/댓글/구독은 job_assignments에서 추적 (did_like, did_comment 등)

    // 완료 체크
    const completed = await videoModels.checkAndComplete(videoId);
    if (completed) {
      log.info('mission_auto_completed', { videoId });
    }
  }

  /** 미션 완료 여부 확인 */
  async isMissionComplete(videoId) {
    return videoModels.checkAndComplete(videoId);
  }

  /** 미션 통계 */
  async getMissionStats() {
    const statuses = ['active', 'paused', 'completed', 'archived'];
    const counts = {};

    for (const s of statuses) {
      const { count, error } = await this._db()
        .from('videos')
        .select('*', { count: 'exact', head: true })
        .eq('status', s);
      counts[s] = error ? 0 : (count || 0);
    }

    return counts;
  }

  // ═══════════════════════════════════════════════════════
  // YouTube Data API 헬퍼
  // ═══════════════════════════════════════════════════════

  /** @private API 쿼터 체크 */
  _checkQuota(cost = 1) {
    if (_apiQuotaUsed + cost > API_QUOTA_DAILY_LIMIT) {
      log.warn('api_quota_exceeded', { used: _apiQuotaUsed, limit: API_QUOTA_DAILY_LIMIT });
      return false;
    }
    _apiQuotaUsed += cost;
    return true;
  }

  /** API 쿼터 리셋 (일일) */
  static resetQuota() { _apiQuotaUsed = 0; }

  /** 현재 쿼터 사용량 */
  get quotaUsed() { return _apiQuotaUsed; }

  /** @private Supabase 클라이언트 접근 */
  _db() { return this.supabase; }

  /** @private 인기 영상 조회 (API 100 units) */
  async _fetchPopularVideos(categoryId, maxResults) {
    if (!this._checkQuota(100)) return [];
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&chart=mostPopular&regionCode=KR&videoCategoryId=${categoryId}&maxResults=${maxResults}&key=${this.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.items || []).map(item => ({
        id: item.id,
        title: item.snippet.title,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        durationSec: _parseDuration(item.contentDetails?.duration),
      }));
    } catch (err) {
      log.error('api_popular_failed', { error: err.message });
      return [];
    }
  }

  /** @private 채널 정보 조회 (API 1 unit) */
  async _fetchChannelInfo(channelId) {
    if (!this._checkQuota(1)) return null;
    try {
      const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${this.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const item = data.items?.[0];
      if (!item) return null;
      return {
        title: item.snippet.title,
        customUrl: item.snippet.customUrl,
        thumbnail: item.snippet.thumbnails?.default?.url,
        subscriberCount: item.statistics.subscriberCount,
        videoCount: item.statistics.videoCount,
      };
    } catch (err) {
      log.error('api_channel_failed', { channelId, error: err.message });
      return null;
    }
  }

  /** @private 채널 영상 목록 조회 (API 100 units) */
  async _fetchChannelVideos(channelId, maxResults) {
    if (!this._checkQuota(100)) return [];
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=${maxResults}&key=${this.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.items || []).map(item => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
      }));
    } catch (err) {
      log.error('api_channel_videos_failed', { channelId, error: err.message });
      return [];
    }
  }
}

/** ISO 8601 duration (PT1H2M3S) → seconds */
function _parseDuration(iso) {
  if (!iso) return 60;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 60;
  return (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2] || '0', 10) * 60) + parseInt(m[3] || '0', 10);
}

module.exports = { VideoManagerService };
