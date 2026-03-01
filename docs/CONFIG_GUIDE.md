# 설정값 관리 가이드

## 개요

- **전역 설정**: 모든 PC·Agent에 공통으로 적용되는 값은 **`settings`** 테이블에서 관리합니다. Agent는 기동 시 `config.loadFromDB()`로 로드하고, Realtime 구독으로 변경을 반영합니다.
- **PC별 설정**: 현재는 `pcs` 테이블의 컬럼(예: device_count, online_count)과 env(`IS_PRIMARY_PC`)로만 구분됩니다. PC별 동작 파라미터(예: PC당 max_concurrent_tasks)를 나중에 분리하려면 **`pc_config`** 테이블 설계를 도입할 수 있습니다.

---

## settings 테이블 (전역 설정 — 이미 사용 중)

현재 프로젝트에서 **system_config 역할**을 하는 테이블은 **`settings`** 입니다.

### 스키마 (마이그레이션 기준)

```sql
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,             -- JSON-encoded value string
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE settings;` 로 Agent 구독 가능.
- `updated_at` 자동 갱신 트리거: 마이그레이션 `20260213080200_step9_settings_table.sql` 참고.

### 초기 시드 (INSERT)

마이그레이션에 정의된 기본값:

```sql
INSERT INTO settings (key, value, description) VALUES
  ('heartbeat_interval',       '30000',                'Heartbeat interval in ms'),
  ('adb_reconnect_interval',   '60000',                'ADB reconnect interval in ms'),
  ('proxy_check_interval',     '300000',               'Proxy check loop interval in ms'),
  ('proxy_policy',             '"sticky"',             'Proxy policy: sticky | rotate_on_failure | rotate_daily'),
  ('max_concurrent_tasks',     '20',                   'Max concurrent tasks per worker'),
  ('device_interval',          '500',                  'Delay between devices in ms'),
  ('watch_duration',           '[30, 120]',            'Watch duration range [min, max] seconds'),
  ('task_interval',            '[1000, 3000]',         'Task interval range [min, max] ms'),
  ('max_retry_count',          '3',                    'Max retry count for failed tasks'),
  ('log_retention_days',       '7',                    'Task log retention in days'),
  ('command_log_retention_days','30',                   'Command log retention in days')
ON CONFLICT (key) DO NOTHING;
```

### Agent 매핑 (config.js SETTING_KEY_MAP)

| DB key | config 속성 |
|--------|-------------|
| heartbeat_interval | heartbeatInterval |
| adb_reconnect_interval | adbReconnectInterval |
| proxy_check_interval | proxyCheckInterval |
| proxy_policy | proxyPolicy |
| max_concurrent_tasks | maxConcurrentTasks |
| task_execution_timeout_ms | taskExecutionTimeoutMs |
| device_interval | deviceInterval |
| watch_duration | watchDuration |
| task_interval | taskInterval |
| max_retry_count | maxRetryCount |
| log_retention_days | logRetentionDays |
| command_log_retention_days | commandLogRetentionDays |

`task_execution_timeout_ms` 는 시드에 없을 수 있음. 필요 시 settings에 추가.

---

## pc_config 테이블 설계 (PC별 설정 — 제안)

현재 코드에는 **pc_config 테이블이 없습니다**. PC별로 다른 값을 두려면 아래 설계를 참고할 수 있습니다.

### 설계 예시 (SQL)

```sql
CREATE TABLE IF NOT EXISTS pc_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pc_id UUID NOT NULL REFERENCES pcs(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(pc_id, key)
);

CREATE INDEX IF NOT EXISTS idx_pc_config_pc_id ON pc_config(pc_id);
```

### 초기 INSERT 예시

PC별 오버라이드가 필요할 때만 행을 넣습니다. 전역 기본값은 `settings`에 두고, PC별만 여기 넣습니다.

```sql
-- 예: PC01만 동시 실행 수 10으로 제한
INSERT INTO pc_config (pc_id, key, value, description)
SELECT id, 'max_concurrent_tasks', '10', 'PC별 동시 태스크 상한'
FROM pcs WHERE pc_number = 'PC01'
ON CONFLICT (pc_id, key) DO NOTHING;
```

(실제 적용 시 Agent에서 `settings` 먼저 읽고, `pc_config`에서 해당 pc_id로 오버라이드하는 로직이 필요합니다. 현재 코드는 미구현.)

---

## 현재 잘못 관리되고 있는 값 목록

| 키 | 현재 위치 | 이동해야 할 위치 | 이유 |
|----|------------|------------------|------|
| HEARTBEAT_INTERVAL, MAX_CONCURRENT_TASKS, TASK_EXECUTION_TIMEOUT_MS | agent/.env | 이미 settings 테이블로 오버라이드 가능. env는 기본값만 유지 | env와 DB 이중 정의; 운영에서는 DB만 쓰는 것이 일관됨 |
| IS_PRIMARY_PC | agent/.env | pc_config 또는 pcs 메타 컬럼 | PC별 설정이므로 DB에서 관리하는 것이 적합 |
| ORCHESTRATE_INTERVAL_MS, WATCH_TIMEOUT_MS, SAME_JOB_MAX_DEVICES | device-orchestrator.js 상수 | 전역 고정이면 코드 상수 유지. 조정 필요하면 settings | 현재 코드 상수로만 존재. 운영에서 조정 필요 시 settings 후보 |
| _LOG_BATCH_SIZE, _LOG_FLUSH_INTERVAL | supabase-sync.js 상수 | 조정 필요 시 settings, 아니면 코드 상수 | 현재 코드 상수. 필요 시 settings 키 추가 |
| task_interval, watch_duration | settings 시드에 있음, task-executor 등에서 사용 | 유지 (settings) | 이미 올바르게 settings에 있음 |
| task_execution_timeout_ms | config.js env 기본값 + SETTING_KEY_MAP | settings 시드에 없을 수 있음 → 시드 추가 권장 | Agent는 DB에서 읽지만, 시드 INSERT에 없으면 확인 필요 |

---

## 설정값 로드 방법

### Agent (Node.js)

1. **기동 시**: Supabase 클라이언트 생성 후 `config.loadFromDB(supabase)` 호출. env 기본값이 있고, DB 행이 있으면 해당 키가 덮어씌워짐.
2. **실시간 반영**: `config.subscribeToChanges(supabase)` 로 `settings` 테이블의 `UPDATE`를 구독. 변경 시 `config-updated` 이벤트 발생, 해당 키가 `SETTING_KEY_MAP`에 있으면 config 인스턴스 프로퍼티가 갱신됨.
3. **값 참조**: `config.get('key')` 또는 `config.heartbeatInterval` 등 프로퍼티로 읽음.

### 대시보드 (Next.js)

- **읽기**: `GET /api/settings` → `{ settings: { [key]: { value, description, updated_at } } }`.
- **쓰기**: `PUT /api/settings` Body `{ key1: value1, ... }` (서버에서 JSON 직렬화 후 `settings.value` 업데이트). Agent는 Realtime으로 자동 반영.

---

## 변경 방법 (대시보드에서 실시간 반영)

1. 대시보드에서 설정 UI가 있다면, 해당 UI가 `PUT /api/settings`를 호출하도록 구현.
2. API에서 `settings` 테이블의 해당 `key`에 대해 `value`, `updated_at` 업데이트.
3. Supabase Realtime이 `settings` 테이블을 발행하므로, 구독 중인 Agent들이 `UPDATE` 페이로드를 받고 `_applySettingFromDB`로 config를 갱신.
4. 별도 Agent 재시작 없이 설정이 반영됨.

(설정 UI 컴포넌트 위치는 코드베이스에서 확인 필요.)
