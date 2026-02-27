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
- With `USE_TASK_DEVICES_ENGINE=true`, legacy tasks path (Broadcast, postgres_changes, task poll) is not started — no double execution.
- Task_queue and commands are still subscribed: task_queue → create task + fan-out task_devices (no execute); commands → absorb into task + task_devices.
- VideoDispatcher (job_assignments creation) is not started when `USE_TASK_DEVICES_ENGINE=true`.

## F) Verification checklist (USE_TASK_DEVICES_ENGINE=true)

1. **Commands absorb:** Dashboard에서 명령 클릭(commands INSERT) → tasks + task_devices 생성되는지 확인.
2. **Task queue absorb:** task_queue로 들어온 작업 → tasks 생성 후 task_devices fan-out 되는지, runner가 claim해서 실행하는지 확인.
3. **Runner:** task_devices를 claim하고 실행하는지 확인.
4. **Job assignments bypass:** job_assignments 폴링/생성/실행이 시작되지 않는지 확인.
