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

1. Run agent: `node agent/agent.js` (or `npm run agent:start` from repo root).
2. Create a task (dashboard or API); confirm `task_devices` rows are created for each PC's devices.
3. Confirm DeviceOrchestrator claims task_devices and runs them (logs: `[DeviceOrchestrator] … → taskDevice …`, `[TaskExecutor] ✓ task_device … completed`).
4. On failure: confirm `retry_count` increases and after 3 retries status becomes `failed`.

## Safety

- `"devices": "all"` may remain in legacy paths; runner does not use it.
- Task execution is DeviceOrchestrator only (task_devices claim → runTaskDevice). No tasks-table subscription or poll.
- Task_queue and schedule evaluator still run: queue_dispatcher creates tasks + task_devices; commands absorbed into task + task_devices.
- VideoDispatcher removed; create tasks + task_devices via web dashboard or queue-dispatcher.

## F) Verification checklist

1. **Commands absorb:** Dashboard에서 명령 클릭(commands INSERT) → tasks + task_devices 생성되는지 확인.
2. **Task queue absorb:** task_queue로 들어온 작업 → tasks 생성 후 task_devices fan-out 되는지, runner가 claim해서 실행하는지 확인.
3. **Runner:** task_devices를 claim하고 실행하는지 확인.
4. **Job assignments bypass:** job_assignments 폴링/생성/실행이 시작되지 않는지 확인.
