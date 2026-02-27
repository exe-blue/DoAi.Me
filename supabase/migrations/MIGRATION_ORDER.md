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
