/**
 * agent/common/logger.js — 구조화된 로깅 모듈
 *
 * JSON 형식 로그, 자동 컨텍스트(timestamp, module, pc_id),
 * 콘솔 + 일별 파일 로테이션 + Supabase 비동기 저장(ERROR 이상).
 *
 * 사용법:
 *   const { getLogger } = require('./common/logger');
 *   const log = getLogger('youtube.search');
 *   log.info('video_found', { deviceId: 'PC01-001', title: '...' });
 *   log.error('search_failed', { deviceId: 'PC01-001', error: err.message });
 *
 * 단독 실행:
 *   node agent/common/logger.js
 */
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// ── 민감정보 마스킹 패턴 ──
const SENSITIVE_PATTERNS = [
  { re: /(sk-[a-zA-Z0-9_-]{20,})/g, mask: 'sk-***MASKED***' },
  { re: /(eyJ[a-zA-Z0-9_-]{20,})/g, mask: 'eyJ***MASKED***' },
  { re: /(password|passwd|secret|token|api_key|apikey)["']?\s*[:=]\s*["']?([^"'\s,}{]+)/gi, mask: '$1=***MASKED***' },
];

function maskSensitive(str) {
  if (typeof str !== 'string') return str;
  let result = str;
  for (const { re, mask } of SENSITIVE_PATTERNS) {
    result = result.replace(re, mask);
  }
  return result;
}

function maskObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const masked = {};
  for (const [key, val] of Object.entries(obj)) {
    const lk = key.toLowerCase();
    if (lk.includes('key') || lk.includes('secret') || lk.includes('password') || lk.includes('token')) {
      masked[key] = typeof val === 'string' && val.length > 4 ? val.substring(0, 4) + '***' : '***';
    } else if (typeof val === 'string') {
      masked[key] = maskSensitive(val);
    } else if (typeof val === 'object' && val !== null) {
      masked[key] = maskObject(val);
    } else {
      masked[key] = val;
    }
  }
  return masked;
}

// ── 로그 디렉토리 ──
const LOG_DIR = path.resolve(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ── PC ID (config 순환참조 방지: env에서 직접 읽음) ──
const PC_ID = process.env.PC_NUMBER || 'PC-00';

// ── Winston 포맷 ──
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, module: mod, ...meta }) => {
    const entry = {
      ts: timestamp,
      level,
      pc: PC_ID,
      mod: mod || 'agent',
      msg: maskSensitive(message),
      ...maskObject(meta),
    };
    // 빈 필드 제거
    Object.keys(entry).forEach(k => {
      if (entry[k] === undefined || entry[k] === null || entry[k] === '') delete entry[k];
    });
    return JSON.stringify(entry);
  })
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, module: mod, ...meta }) => {
    const prefix = mod ? `[${mod}]` : '';
    const metaStr = Object.keys(meta).length > 0
      ? ' ' + JSON.stringify(maskObject(meta))
      : '';
    return `${timestamp} ${level.toUpperCase().padEnd(5)} ${prefix} ${maskSensitive(message)}${metaStr}`;
  })
);

// ── 일별 파일명 ──
function dailyFilename() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.log`;
}

// ── 메인 로거 인스턴스 ──
const rootLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, dailyFilename()),
      format: jsonFormat,
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 7, // keep 7 days
    }),
  ],
});

// ── Supabase 비동기 저장 (ERROR 이상) ──
let _supabase = null;
let _logBuffer = [];
const _LOG_FLUSH_INTERVAL = 5000;
const _LOG_MAX_BUFFER = 200;
let _flushTimer = null;
let _flushing = false;

function setSupabase(supabaseClient) {
  _supabase = supabaseClient;
  if (!_flushTimer) {
    _flushTimer = setInterval(_flushToSupabase, _LOG_FLUSH_INTERVAL);
    if (_flushTimer.unref) _flushTimer.unref();
  }
}

async function _flushToSupabase() {
  if (!_supabase || _logBuffer.length === 0 || _flushing) return;
  _flushing = true;
  const entries = _logBuffer.splice(0);
  try {
    const { error } = await _supabase.from('execution_logs').insert(entries);
    if (error) {
      // 실패 시 복원 (최대 버퍼 초과 시 드롭)
      if (_logBuffer.length + entries.length <= _LOG_MAX_BUFFER) {
        _logBuffer.unshift(...entries);
      }
    }
  } catch {
    // 로그 저장 실패가 메인 로직 블로킹하면 안 됨
  } finally {
    _flushing = false;
  }
}

function _pushToSupabase(level, module, message, meta) {
  if (!_supabase) return;
  if (_logBuffer.length >= _LOG_MAX_BUFFER) _logBuffer.shift();
  _logBuffer.push({
    level,
    status: level === 'error' ? 'failed' : 'completed',
    message: maskSensitive(message),
    data: maskObject({ module, ...meta }),
    device_id: meta.deviceId || meta.device_id || null,
  });
}

// ── getLogger: 모듈별 자식 로거 ──

/**
 * 모듈별 로거 생성
 * @param {string} moduleName - e.g. 'youtube.search', 'proxy.service'
 * @returns {{ debug, info, warn, error, fatal }}
 */
function getLogger(moduleName) {
  return {
    debug(msg, meta = {}) {
      rootLogger.debug(msg, { module: moduleName, ...meta });
    },
    info(msg, meta = {}) {
      rootLogger.info(msg, { module: moduleName, ...meta });
    },
    warn(msg, meta = {}) {
      rootLogger.warn(msg, { module: moduleName, ...meta });
    },
    error(msg, meta = {}) {
      rootLogger.error(msg, { module: moduleName, ...meta });
      _pushToSupabase('error', moduleName, msg, meta);
    },
    fatal(msg, meta = {}) {
      rootLogger.error(`[FATAL] ${msg}`, { module: moduleName, ...meta });
      _pushToSupabase('error', moduleName, `[FATAL] ${msg}`, meta);
    },
  };
}

/** 남은 로그 플러시 (shutdown 시 호출) */
async function flush() {
  if (_flushTimer) { clearInterval(_flushTimer); _flushTimer = null; }
  await _flushToSupabase();
}

/**
 * 7일 이상 오래된 로그 파일 삭제 (디스크 풀 방지)
 * 시작 시 1회 호출 권장.
 */
function cleanOldLogs(retentionDays = 7) {
  try {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
    let deleted = 0;
    for (const f of files) {
      const filePath = path.join(LOG_DIR, f);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    }
    if (deleted > 0) {
      const logger = getLogger('common.logger');
      logger.info('old_logs_cleaned', { deleted, retentionDays });
    }
  } catch {}
}

module.exports = { getLogger, setSupabase, flush, cleanOldLogs };

// 단독 실행: node agent/common/logger.js
if (require.main === module) {
  const log = getLogger('logger.test');
  log.info('logger_initialized', { pcId: PC_ID });
  log.debug('debug_message', { detail: 'this is debug' });
  log.warn('warning_test', { deviceId: 'PC01-001' });
  log.error('error_test', { deviceId: 'PC01-001', error: 'test error' });
  log.info('sensitive_test', { apiKey: 'sk-proj-1234567890abcdef', password: 'supersecret' });
  console.log(`\nLog file: ${path.join(LOG_DIR, dailyFilename())}`);
}
