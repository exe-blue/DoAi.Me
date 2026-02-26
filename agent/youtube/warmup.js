/**
 * agent/youtube/warmup.js — AI 키워드 기반 워밍업 시청
 *
 * 유휴 기기에서 랜덤 키워드 검색 → 영상 시청 (6~8회) → 10분 sleep.
 * 미션 수신 시 즉시 인터럽트 가능.
 *
 * 사용법:
 *   const { WarmupManager } = require('./youtube/warmup');
 *   const warmup = new WarmupManager(openaiApiKey);
 *   await warmup.runSession(dev); // 6~8 영상 → sleep
 *   warmup.interrupt(); // 미션 수신 시 즉시 중단
 */
const { getLogger } = require('../common/logger');
const { dumpUI, getPlaybackState } = require('../adb/screen');
const { sleep, randInt, humanDelay } = require('../adb/helpers');
const { searchAndSelect } = require('./search');
const { handlePrerollAds, ensurePlaying, trySkipAd } = require('./watch');

const log = getLogger('youtube.warmup');

/** 기본 워밍업 키워드 (AI 생성 전 폴백) */
const DEFAULT_KEYWORDS = {
  investment: [
    '비트코인 전망 2026', '주식 초보 시작', 'ETF 추천 종목', '삼성전자 배당금',
    '부동산 투자 전략', '코인 시세 분석', '미국 주식 추천', '금 투자 방법',
  ],
  daily: [
    '서울 맛집 추천', '겨울 코디 추천', '카페 브이로그', '자취 꿀팁',
    '운동 루틴 초보', '피부 관리 팁', '주말 나들이 추천', '인테리어 아이디어',
  ],
  misc: [
    '고양이 영상 모음', '게임 리뷰 2026', '요리 레시피 간단', 'ASMR 공부',
    '영화 리뷰 추천', '음악 플레이리스트', '여행 브이로그', '유튜버 추천',
  ],
};

const SLEEP_DURATION_MS = 10 * 60 * 1000; // 10분
const VIDEOS_PER_SESSION = { min: 6, max: 8 };
const WATCH_DURATION = { min: 30, max: 120 }; // 초

class WarmupManager {
  /**
   * @param {string} [openaiApiKey]
   * @param {string} [openaiModel]
   */
  constructor(openaiApiKey, openaiModel) {
    this.apiKey = openaiApiKey || process.env.OPENAI_API_KEY || '';
    this.model = openaiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this._interrupted = false;
    this._sleeping = false;
    this._keywords = null; // 캐시
  }

  /** 미션 수신 시 즉시 중단 */
  interrupt() {
    this._interrupted = true;
    log.info('warmup_interrupted');
  }

  /** 인터럽트 상태 리셋 */
  reset() {
    this._interrupted = false;
    this._sleeping = false;
  }

  get isInterrupted() { return this._interrupted; }
  get isSleeping() { return this._sleeping; }

  /**
   * 워밍업 세션 실행: 6~8개 영상 시청 → 10분 sleep
   * @param {import('../adb/client').ADBDevice} dev
   * @returns {Promise<{videosWatched: number, interrupted: boolean, keywords: string[]}>}
   */
  async runSession(dev) {
    this.reset();
    const keywords = await this.getKeywords();
    const videoCount = randInt(VIDEOS_PER_SESSION.min, VIDEOS_PER_SESSION.max);
    const watchedKeywords = [];
    let videosWatched = 0;

    log.info('warmup_session_start', { serial: dev.serial, planned: videoCount });

    for (let i = 0; i < videoCount; i++) {
      if (this._interrupted) {
        log.info('warmup_interrupted_during_watch', { serial: dev.serial, watched: videosWatched });
        return { videosWatched, interrupted: true, keywords: watchedKeywords };
      }

      const keyword = keywords[randInt(0, keywords.length - 1)];
      watchedKeywords.push(keyword);

      try {
        log.info('warmup_video', { serial: dev.serial, index: i + 1, keyword });

        // 검색 + 선택
        await dev.wakeUp();
        await dev.forcePortrait();
        await searchAndSelect(dev, keyword);

        if (this._interrupted) break;

        // 광고 건너뛰기
        await handlePrerollAds(dev);

        if (this._interrupted) break;

        // 재생 확인
        await ensurePlaying(dev);

        // 시청 (랜덤 30~120초)
        const watchSec = randInt(WATCH_DURATION.min, WATCH_DURATION.max);
        log.info('warmup_watching', { serial: dev.serial, keyword, seconds: watchSec });

        const tickMs = 5000;
        let elapsed = 0;
        while (elapsed < watchSec * 1000) {
          if (this._interrupted) break;
          const wait = Math.min(tickMs, watchSec * 1000 - elapsed);
          await sleep(wait);
          elapsed += wait;

          // 광고 체크 (15초마다)
          if (elapsed % 15000 < tickMs) {
            try { await trySkipAd(dev); } catch {}
          }
          // 화면 깨우기 (30초마다)
          if (elapsed % 30000 < tickMs) {
            try { await dev.wakeUp(); } catch {}
          }
        }

        videosWatched++;
        log.info('warmup_video_done', { serial: dev.serial, index: i + 1, keyword, watchSec });

        // 영상 간 딜레이 (3~8초)
        await sleep(randInt(3000, 8000));

      } catch (err) {
        log.warn('warmup_video_error', { serial: dev.serial, keyword, error: err.message });
      }
    }

    // 홈으로
    try { await dev.goHome(); } catch {}

    // Sleep (인터럽트 가능)
    if (!this._interrupted) {
      log.info('warmup_sleep_start', { serial: dev.serial, durationMin: SLEEP_DURATION_MS / 60000 });
      this._sleeping = true;

      const sleepTick = 5000;
      let slept = 0;
      while (slept < SLEEP_DURATION_MS && !this._interrupted) {
        await sleep(Math.min(sleepTick, SLEEP_DURATION_MS - slept));
        slept += sleepTick;
      }
      this._sleeping = false;

      if (this._interrupted) {
        log.info('warmup_sleep_interrupted', { serial: dev.serial, sleptSec: Math.round(slept / 1000) });
      } else {
        log.info('warmup_sleep_done', { serial: dev.serial });
      }
    }

    return { videosWatched, interrupted: this._interrupted, keywords: watchedKeywords };
  }

  /**
   * AI로 워밍업 키워드 생성 (캐시됨)
   * @returns {Promise<string[]>}
   */
  async getKeywords() {
    if (this._keywords && this._keywords.length > 0) return this._keywords;

    // AI 생성 시도
    if (this.apiKey) {
      try {
        this._keywords = await this._generateKeywordsAI();
        log.info('warmup_keywords_generated', { count: this._keywords.length, source: 'openai' });
        return this._keywords;
      } catch (err) {
        log.warn('warmup_keywords_ai_failed', { error: err.message });
      }
    }

    // 폴백: 기본 키워드
    this._keywords = [
      ...DEFAULT_KEYWORDS.investment,
      ...DEFAULT_KEYWORDS.daily,
      ...DEFAULT_KEYWORDS.misc,
    ];
    log.info('warmup_keywords_fallback', { count: this._keywords.length });
    return this._keywords;
  }

  /** 키워드 캐시 초기화 (새 키워드 생성 유도) */
  clearKeywordCache() {
    this._keywords = null;
  }

  /** @private OpenAI로 키워드 생성 */
  async _generateKeywordsAI() {
    const prompt = `YouTube 검색용 한국어 키워드를 30개 생성해주세요.

카테고리별로 10개씩:
1. 투자/재테크 (주식, 암호화폐, 부동산, ETF 등)
2. 일상/라이프스타일 (맛집, 패션, 운동, 요리 등)
3. 기타/엔터테인먼트 (게임, 영화, 음악, 여행 등)

규칙:
- 실제 사람이 YouTube에서 검색할 법한 자연스러운 키워드
- 2~6단어 길이
- 시의성 있는 키워드 포함 (2026년 트렌드)
- 각 키워드를 줄바꿈으로 구분
- 카테고리 헤더 없이 키워드만 출력`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 1.0,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI API ${response.status}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    const keywords = text.split('\n')
      .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(line => line.length >= 3 && line.length <= 30);

    if (keywords.length < 10) throw new Error(`Too few keywords: ${keywords.length}`);
    return keywords;
  }
}

module.exports = { WarmupManager, DEFAULT_KEYWORDS };
