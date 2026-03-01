# Migration order (filename order)

Migrations in `supabase/migrations` listed by filename; apply in this order.

- `00001_initial_schema.sql` — initial schema
- `00002_channels_videos_schedules.sql` — channels, videos, schedules
- `00003_realtime_broadcast.sql` — realtime broadcast
- `00004_pg_cron_jobs.sql` — pg_cron jobs
- `00005_fn_sync_task_progress.sql` — sync task progress function
- `00006_broadcast_system_workers.sql` — broadcast system workers
- `00007_fix_broadcast_topic_prefix.sql` — fix broadcast topic prefix
- `20240201_add_proxy_columns.sql` — add proxy columns
- `20260213_step12_task_queue_schedules.sql` — task queue schedules
- `20260213080000_step8_retention_cron.sql` — step8 retention cron
- `20260213080100_step8_task_devices_progress.sql` — task devices progress
- `20260213080200_step9_settings_table.sql` — settings table
- `20260213080300_step9_settings_proxy_failcount.sql` — settings proxy failcount
- `20260213080400_step10_command_logs_table.sql` — command logs table
- `20260213080500_step10_task_devices_config.sql` — task devices config
- `20260213080600_step11_channels_content.sql` — channels content
- `20260214000000_app_users.sql` — app users
- `20260215000000_repair_schema.sql` — repair schema
- `20260223000000_devices_orchestrator_columns.sql` — devices orchestrator columns
- `20260223120000_fix_dashboard_summary_view.sql` — fix dashboard summary view
- `20260223130000_step6_step7_video_progress_and_verify.sql` — video progress and verify
- `20260223130000_step7_verify.sql` — step7 verify
- `20260225000000_e2e_diagnostic_queries.sql` — e2e diagnostic queries
- `20260225100000_job_assignments_pc_video_claim.sql` — job_assignments PC/video claim
- `20260225110000_job_assignments_device_id_nullable.sql` — device_id nullable
- `run_step6_and_step7.sql` — run step6 and step7
- `20260229000000_task_devices_on_task_insert_trigger.sql` — Layer 3: create task_devices on tasks INSERT (server-side)
- `20260229000001_task_devices_on_device_insert_trigger.sql` — add task_device when new device inserted (current running task)
- `20260229000002_task_and_task_device_timeouts.sql` — task 30min / task_device 20min timeout + cron
- `20260301000000_task_queue_columns_and_dequeue_rpc.sql` — task_queue video_id, discovered_run_id, order_key, processing_started_at; dequeue_task_queue_item RPC
- `20260301000001_task_devices_comment_status_timeout.sql` — task_devices comment_status, timeout_at; fn_timeout prefers timeout_at
- `20260301000002_mark_device_offline.sql` — mark_device_offline RPC; system_config offline_threshold
- `20260301000003_task_devices_trigger_pc_filter.sql` — fn_create_task_devices_on_task_insert PC별 1개 (exclude busy PCs)
- `20260301000004_device_insert_pending_only.sql` — fn_add_task_device_for_new_device pending only (late-join policy A)
- `20260301000005_sync_lock_rpc.sql` — try_sync_lock / release_sync_lock
- `20260301000006_task_devices_trigger_action_touch_coords.sql` — fn_create_task_devices_on_task_insert: config includes action_touch_coords from payload
