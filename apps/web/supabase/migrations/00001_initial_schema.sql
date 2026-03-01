-- DoAi.Me v2.1 - Initial Schema
-- Supabase PostgreSQL

-- 노드PC (워커)
CREATE TABLE workers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname      TEXT UNIQUE NOT NULL,
  ip_local      TEXT,
  ip_public     TEXT,
  status        TEXT DEFAULT 'offline',
  device_count  INT DEFAULT 0,
  xiaowei_connected BOOLEAN DEFAULT false,
  last_heartbeat TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 디바이스 (Galaxy S9)
CREATE TABLE devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial        TEXT UNIQUE NOT NULL,
  worker_id     UUID REFERENCES workers(id),
  nickname      TEXT,
  model         TEXT,
  status        TEXT DEFAULT 'offline',
  connection_mode INT DEFAULT 0,
  current_task  UUID,
  account_id    UUID,
  proxy         TEXT,
  ip_intranet   TEXT,
  battery       INT,
  last_seen     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Google 계정 풀
CREATE TABLE accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  status        TEXT DEFAULT 'available',
  device_id     UUID REFERENCES devices(id),
  login_count   INT DEFAULT 0,
  last_used     TIMESTAMPTZ,
  banned_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 프리셋 (Xiaowei Action/Script 매핑)
CREATE TABLE presets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,
  description   TEXT,
  config        JSONB NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 작업
CREATE TABLE tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id     UUID REFERENCES presets(id),
  type          TEXT NOT NULL,
  status        TEXT DEFAULT 'pending',
  priority      INT DEFAULT 5,
  payload       JSONB NOT NULL,
  target_devices TEXT[],
  target_workers TEXT[],
  worker_id     UUID REFERENCES workers(id),
  result        JSONB,
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

-- 실행 로그
CREATE TABLE task_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID REFERENCES tasks(id),
  device_serial TEXT,
  worker_id     UUID REFERENCES workers(id),
  action        TEXT,
  request       JSONB,
  response      JSONB,
  status        TEXT NOT NULL,
  message       TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 프록시 풀
CREATE TABLE proxies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address       TEXT UNIQUE NOT NULL,
  type          TEXT DEFAULT 'http',
  status        TEXT DEFAULT 'active',
  assigned_count INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_devices_worker ON devices(worker_id);
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_worker ON tasks(worker_id);
CREATE INDEX idx_task_logs_task ON task_logs(task_id);
CREATE INDEX idx_task_logs_device ON task_logs(device_serial);
