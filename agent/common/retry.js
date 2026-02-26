/**
 * agent/common/retry.js — 리트라이 유틸 (지수 백오프 + 지터)
 *
 * 사용법:
 *   const { retry, withRetry } = require('./common/retry');
 *
 *   // 함수 래핑
 *   const result = await retry(() => connectDevice(serial), {
 *     maxAttempts: 3, delay: 2000, backoff: 2, retryOn: [ADBError]
 *   });
 *
 *   // 데코레이터 스타일 (클래스 메서드)
 *   class MyService {
 *     constructor() {
 *       this.connect = withRetry(this.connect.bind(this), { maxAttempts: 3 });
 *     }
 *   }
 */
const { getLogger } = require('./logger');
const log = getLogger('common.retry');

/**
 * 리트라이 실행
 * @param {Function} fn - async 함수
 * @param {object} [options]
 * @param {number} [options.maxAttempts=3] - 최대 시도 횟수
 * @param {number} [options.delay=1000] - 초기 딜레이 (ms)
 * @param {number} [options.backoff=2] - 백오프 배수
 * @param {number} [options.maxDelay=30000] - 최대 딜레이
 * @param {number} [options.jitter=0.3] - 지터 비율 (0~1)
 * @param {Array<Function>} [options.retryOn] - 이 에러 타입만 리트라이 (비면 모두)
 * @param {Array<Function>} [options.abortOn] - 이 에러 타입은 즉시 throw
 * @param {string} [options.label] - 로그용 라벨
 * @returns {Promise<*>}
 */
async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 2,
    maxDelay = 30000,
    jitter = 0.3,
    retryOn = [],
    abortOn = [],
    label = fn.name || 'anonymous',
  } = options;

  let lastError;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // abortOn에 해당하면 즉시 throw
      if (abortOn.length > 0 && abortOn.some(E => err instanceof E)) {
        log.error(`${label} abort on attempt ${attempt}/${maxAttempts}`, {
          error: err.message, errorType: err.name,
        });
        throw err;
      }

      // retryOn이 지정되었는데 해당 에러가 아니면 즉시 throw
      if (retryOn.length > 0 && !retryOn.some(E => err instanceof E)) {
        log.error(`${label} non-retryable error on attempt ${attempt}/${maxAttempts}`, {
          error: err.message, errorType: err.name,
        });
        throw err;
      }

      // 마지막 시도면 throw
      if (attempt >= maxAttempts) {
        log.error(`${label} failed after ${maxAttempts} attempts`, {
          error: err.message, errorType: err.name,
        });
        throw err;
      }

      // 지터 적용 딜레이
      const jitterAmount = currentDelay * jitter * (Math.random() * 2 - 1);
      const waitMs = Math.min(Math.round(currentDelay + jitterAmount), maxDelay);

      log.warn(`${label} attempt ${attempt}/${maxAttempts} failed, retry in ${waitMs}ms`, {
        error: err.message, errorType: err.name,
      });

      await new Promise(r => setTimeout(r, waitMs));
      currentDelay = Math.min(currentDelay * backoff, maxDelay);
    }
  }

  throw lastError;
}

/**
 * 함수를 리트라이 래핑 (데코레이터 스타일)
 * @param {Function} fn
 * @param {object} options - retry() 옵션과 동일
 * @returns {Function}
 */
function withRetry(fn, options = {}) {
  const label = options.label || fn.name || 'wrapped';
  return function (...args) {
    return retry(() => fn.apply(this, args), { ...options, label });
  };
}

module.exports = { retry, withRetry };
