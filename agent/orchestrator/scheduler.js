/**
 * agent/orchestrator/scheduler.js — 기기별 미션 배분 & 시간대 스케줄링
 *
 * 유휴 기기에 미션/워밍업 배분, 동시 실행 수 제한, 시간대별 활동량 조절.
 */
const { getLogger } = require('../common/logger');
const { sleep, randInt } = require('../adb/helpers');
const { CONSTANTS } = require('../common/config');

const log = getLogger('orchestrator.scheduler');

/**
 * 시간대별 활동량 비율 (0.0 ~ 1.0)
 *
 * 운영 기준: 하루 20개 영상 × 100회 = 2000회 소화 필요.
 * 1대 = ~40회/시간 (90초/회). 심야에도 50%+ 가동.
 *
 *   심야(0-5시):  50~60% (50~60대) — 자연스러운 감소, 완전 중단 안 함
 *   아침(6-8시):  70~80% (70~80대) — 점진 상승
 *   주간(9-18시): 90~100% (90~100대) — 최대 가동
 *   저녁(19-22시): 85~95% (85~95대) — 높게 유지
 *   밤(23시):     65% (65대) — 점진 감소
 */
const HOURLY_ACTIVITY = {
  0: 0.55, 1: 0.50, 2: 0.50, 3: 0.50, 4: 0.50, 5: 0.55,
  6: 0.70, 7: 0.75, 8: 0.80, 9: 0.90, 10: 0.95, 11: 1.0,
  12: 1.0, 13: 0.95, 14: 0.95, 15: 0.95, 16: 1.0, 17: 1.0,
  18: 0.95, 19: 0.95, 20: 0.90, 21: 0.85, 22: 0.80, 23: 0.65,
};

/** 워밍업 vs 미션 비율 */
const WARMUP_RATIO = 0.30;

class DeviceScheduler {
  /**
   * @param {object} deps
   * @param {import('./queue').MissionQueue} deps.queue
   * @param {import('../device/service').DeviceService} deps.deviceService
   * @param {import('../video-manager/service').VideoManagerService} deps.videoManager
   * @param {object} deps.config
   */
  constructor(deps) {
    this.queue = deps.queue;
    this.deviceService = deps.deviceService;
    this.videoManager = deps.videoManager;
    this.config = deps.config;
    this._paused = false;
    this._running = new Set(); // serial → mission in progress
  }

  /** 현재 시간대 활동량 비율 */
  get currentActivityRate() {
    return HOURLY_ACTIVITY[new Date().getHours()] || 0.5;
  }

  /** 동시 실행 가능 기기 수 (시간대 반영) */
  get maxConcurrent() {
    const base = this.config.maxConcurrentTasks || 20;
    return Math.max(1, Math.round(base * this.currentActivityRate));
  }

  /** 현재 실행 중 기기 수 */
  get runningCount() {
    return this._running.size;
  }

  /**
   * 유휴 기기에 미션 배분
   * @returns {Promise<{assigned: number, warmup: number, mission: number, skipped: number}>}
   */
  async assignMissions() {
    if (this._paused) {
      log.info('scheduler_paused');
      return { assigned: 0, warmup: 0, mission: 0, skipped: 0 };
    }

    const available = this.maxConcurrent - this._running.size;
    if (available <= 0) {
      log.debug('no_slots', { running: this._running.size, max: this.maxConcurrent });
      return { assigned: 0, warmup: 0, mission: 0, skipped: 0 };
    }

    // 온라인 기기 목록
    const serials = await this.deviceService.getOnlineSerials();
    const idleSerials = serials.filter(s => !this._running.has(s));

    if (idleSerials.length === 0) {
      return { assigned: 0, warmup: 0, mission: 0, skipped: 0 };
    }

    // 할당 가능 수 = min(유휴 기기, 동시 슬롯)
    const toAssign = Math.min(idleSerials.length, available);
    const warmupCount = Math.round(toAssign * WARMUP_RATIO);
    const missionCount = toAssign - warmupCount;

    let assigned = 0;
    let warmup = 0;
    let mission = 0;
    let skipped = 0;

    // 워밍업 배분
    for (let i = 0; i < warmupCount && i < idleSerials.length; i++) {
      const serial = idleSerials[i];
      const warmupVideo = await this.videoManager.getWarmupVideo();
      if (warmupVideo) {
        this._running.add(serial);
        warmup++;
        assigned++;
        log.info('warmup_assigned', { serial, videoId: warmupVideo.id });
      } else {
        skipped++;
      }
    }

    // 미션 배분 (큐에서 dequeue 또는 VideoManager에서 next)
    for (let i = warmupCount; i < toAssign && i < idleSerials.length; i++) {
      const serial = idleSerials[i];

      // 1순위: 큐에서 미션
      const queued = await this.queue.dequeue(this.deviceService.pcId);
      if (queued) {
        this._running.add(serial);
        mission++;
        assigned++;
        log.info('mission_assigned_queue', { serial, queueId: queued.id });
        continue;
      }

      // 2순위: VideoManager에서 다음 미션
      const nextMission = await this.videoManager.getNextMission();
      if (nextMission) {
        this._running.add(serial);
        mission++;
        assigned++;
        log.info('mission_assigned_video', { serial, videoId: nextMission.id });
        continue;
      }

      skipped++;
    }

    if (assigned > 0) {
      log.info('assign_complete', { assigned, warmup, mission, skipped, rate: this.currentActivityRate });
    }

    return { assigned, warmup, mission, skipped };
  }

  /**
   * 미션 완료 시 기기 해제
   * @param {string} serial
   */
  releaseDevice(serial) {
    this._running.delete(serial);
    log.debug('device_released', { serial, running: this._running.size });
  }

  /**
   * 오늘의 스케줄 (시간대별 활동량)
   * @returns {object} { hour: activityRate }
   */
  getDailySchedule() {
    const schedule = {};
    for (let h = 0; h < 24; h++) {
      const max = this.config.maxConcurrentTasks || 20;
      schedule[h] = {
        rate: HOURLY_ACTIVITY[h],
        maxDevices: Math.max(1, Math.round(max * HOURLY_ACTIVITY[h])),
      };
    }
    return schedule;
  }

  /** 전체 일시 중지 */
  pause() {
    this._paused = true;
    log.warn('scheduler_paused');
  }

  /** 재개 */
  resume() {
    this._paused = false;
    log.info('scheduler_resumed');
  }

  /** 일시 중지 상태 */
  get isPaused() { return this._paused; }
}

module.exports = { DeviceScheduler, HOURLY_ACTIVITY };
