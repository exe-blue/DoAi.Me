# 마이그레이션 실행 순서

Supabase를 새로 세팅했거나 스키마를 복구할 때, 아래 순서대로 SQL을 적용하세요.

## 1. Supabase Dashboard SQL Editor에서 실행하는 경우

한 번에 하나씩 **파일 내용 전체**를 복사해 SQL Editor에 붙여넣고 실행합니다. 실패하면 이미 적용된 객체가 있는 것이므로, 해당 구문만 건너뛰거나 `repair` 마이그레이션으로 빠진 부분만 보완합니다.

| 순서 | 파일 | 설명 |
|------|------|------|
| 1 | `00001_initial_schema.sql` | workers, devices, accounts, presets, tasks, task_logs, proxies |
| 2 | `00002_channels_videos_schedules.sql` | channels, videos, schedules + tasks 컬럼 확장 |
| 3 | `20240201_add_proxy_columns.sql` | proxies worker_id, device_id |
| 4 | **`20260215000000_repair_schema.sql`** | ENUMs, task_devices, system_events, 누락 컬럼·트리거 |
| 5 | `00003_realtime_broadcast.sql` | pg_net, broadcast 함수, tasks/task_logs 트리거 (Vault 설정 필요) |
| 6 | `00004_pg_cron_jobs.sql` | pg_cron 스케줄 (Pro 플랜 등) |
| 7 | `00005_fn_sync_task_progress.sql` | task_devices → tasks 카운트 동기화 (repair에 포함됨, 선택) |
| 8 | `00006_broadcast_system_workers.sql` | system_events, workers broadcast 트리거 |
| 9 | `00007_fix_broadcast_topic_prefix.sql` | broadcast_to_channel 토픽 수정 |
| 10 | `20260213080000_step8_retention_cron.sql` | 로그 retention cron |
| 11 | `20260213080100_step8_task_devices_progress.sql` | task_devices progress (repair에 반영됨) |
| 12 | `20260213080200_step9_settings_table.sql` | settings 테이블 + seed |
| 13 | `20260213080300_step9_settings_proxy_failcount.sql` | settings 보강, proxies fail_count/username/password |
| 14 | `20260213080400_step10_command_logs_table.sql` | command_logs |
| 15 | `20260213080500_step10_task_devices_config.sql` | task_devices.config (repair에 반영됨) |
| 16 | `20260213080600_step11_channels_content.sql` | channels/videos 컬럼 |
| 17 | `20260213_step12_task_queue_schedules.sql` | task_queue, task_schedules |
| 18 | `20260226140000_task_devices_refill_on_complete.sql` | 한 대 완료 시 같은 task에 pending 1건 리필 트리거 |
| 19 | `20260226150000_task_devices_pc_scope.sql` | task_devices.pc_id 추가, 리필을 같은 PC로 한정 (PC 단위 가드레일) |
| 20 | `20260226160000_refill_steal_from_queue.sql` | 리필 시 대기열(다음 영상) pending 1건을 현재 영상으로 재배정, 없을 때만 새 행 추가 (영상<기기) |

**요약:**  
- 이미 테이블이 있으면 `00001`, `00002`는 건너뛰고, **`20260215000000_repair_schema.sql`** 만 실행해도 누락된 테이블(task_devices, system_events)과 컬럼을 채울 수 있습니다.  
- Realtime/Broadcast(00003, 00006, 00007)는 Vault에 `supabase_url`, `supabase_service_role_key` 설정 후 실행하세요.

## 2. Supabase CLI로 적용하는 경우

```bash
supabase db push
```

`supabase/migrations/` 폴더의 파일명 순서대로 적용됩니다. 이미 적용된 마이그레이션은 Supabase가 기록해 두고 건너뜁니다. 새로 추가한 `20260215000000_repair_schema.sql`은 그 순서에 맞춰 자동으로 실행됩니다.

## 3. 적용 후 확인

`verify_schema.sql`을 실행해 테이블·ENUM·트리거·cron·Realtime 등이 기대한 개수/이름과 맞는지 확인하세요.
