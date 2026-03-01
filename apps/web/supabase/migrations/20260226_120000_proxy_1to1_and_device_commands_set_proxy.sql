-- Proxy 1:1 enforcement + set_proxy command support
-- devices.proxy_id: at most one device per proxy (UNIQUE)
-- proxies.device_id: at most one proxy per device (UNIQUE, already added in 20240201)
-- set_proxy/clear_proxy: used in command_logs.command (application layer; no CHECK on command_logs)

-- 1. devices.proxy_id UNIQUE (one proxy cannot be assigned to multiple devices)
CREATE UNIQUE INDEX IF NOT EXISTS devices_proxy_id_unique
  ON devices(proxy_id) WHERE proxy_id IS NOT NULL;

-- 2. proxies.device_id UNIQUE (one device cannot have multiple proxies) — may already exist from 20240201
CREATE UNIQUE INDEX IF NOT EXISTS proxies_device_id_unique
  ON proxies(device_id) WHERE device_id IS NOT NULL;

-- Note: command_logs has no command_type CHECK. set_proxy and clear_proxy are allowed
-- in application code (POST /api/devices/command and auto-assign inserting command_logs).
