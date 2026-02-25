/**
 * agent/adb/helpers.js — 딜레이, 랜덤 오프셋, 휴먼 시뮬레이션 유틸
 */

/** Promise 기반 sleep */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** 랜덤 정수 [min, max] 포함 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 랜덤 딜레이 (humanDelay: 800~2500ms) */
function humanDelay(minMs = 800, maxMs = 2500) {
  return sleep(randInt(minMs, maxMs));
}

/** 중심 좌표에 ±offset 랜덤 적용 (봇 감지 방지) */
function jitterCoord(x, y, offset = 4) {
  return {
    x: x + randInt(-offset, offset),
    y: y + randInt(-offset, offset),
  };
}

/** 비율 좌표 → 절대 좌표 변환 */
function pctToAbs(xPct, yPct, screenW = 1080, screenH = 1920) {
  return {
    x: Math.round(screenW * xPct / 100),
    y: Math.round(screenH * yPct / 100),
  };
}

module.exports = { sleep, randInt, humanDelay, jitterCoord, pctToAbs };
