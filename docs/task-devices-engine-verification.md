# Task-devices engine verification

## DB

```sql
-- Tables
SELECT * FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'task_devices';

-- RPCs
SELECT proname FROM pg_proc WHERE proname IN (
  'claim_task_devices_for_pc',
  'renew_task_device_lease',
  'complete_task_device',
  'fail_or_retry_task_device'
);
```

## Agent (Dev Container)

1. Run with task_devices engine:
   ```bash
   USE_TASK_DEVICES_ENGINE=true node agent/agent.js
   ```
2. Create a task (dashboard or API); confirm `task_devices` rows are created for each PC's devices.
3. Confirm runner claims up to 10 and starts execution (logs: `[TaskDevicesRunner] Started`, `Completed task_device`).
4. On failure: confirm `retry_count` increases and after 3 retries status becomes `failed`.

## Safety

- `"devices": "all"` may remain in legacy paths; runner does not use it.
- With `USE_TASK_DEVICES_ENGINE=true`, legacy tasks path (Broadcast, postgres_changes, task_queue, task poll) is not started — no double execution.
