#!/usr/bin/env bash
# Run migrations in order against a Postgres DB.
# Usage: SUPABASE_DB_URL='postgresql://...' ./run_migrations.sh
# Or:   ./run_migrations.sh  # uses DATABASE_URL or connection string from .env
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Allow individual migration failure (e.g. already applied)
RUN_FAILED=0
cd "$SCRIPT_DIR"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"

if [ -z "${SUPABASE_DB_URL}" ] && [ -n "${DATABASE_URL}" ]; then
  SUPABASE_DB_URL="$DATABASE_URL"
fi
if [ -z "${SUPABASE_DB_URL}" ]; then
  echo "Set SUPABASE_DB_URL or DATABASE_URL (e.g. postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres)"
  exit 1
fi

# Order: initial → channels → proxy → app_users → repair → realtime → cron → steps
ORDER=(
  "00001_initial_schema.sql"
  "00002_channels_videos_schedules.sql"
  "20240201_add_proxy_columns.sql"
  "20260214000000_app_users.sql"
  "20260215000000_repair_schema.sql"
  "00003_realtime_broadcast.sql"
  "00004_pg_cron_jobs.sql"
  "00005_fn_sync_task_progress.sql"
  "00006_broadcast_system_workers.sql"
  "00007_fix_broadcast_topic_prefix.sql"
  "20260213080000_step8_retention_cron.sql"
  "20260213080100_step8_task_devices_progress.sql"
  "20260213080200_step9_settings_table.sql"
  "20260213080300_step9_settings_proxy_failcount.sql"
  "20260213080400_step10_command_logs_table.sql"
  "20260213080500_step10_task_devices_config.sql"
  "20260213080600_step11_channels_content.sql"
  "20260213_step12_task_queue_schedules.sql"
)

for f in "${ORDER[@]}"; do
  path="$MIGRATIONS_DIR/$f"
  if [ ! -f "$path" ]; then
    echo "[skip] $f (not found)"
    continue
  fi
  echo "[run] $f"
  if ! psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$path"; then
    echo "[warn] $f failed (may be already applied)"
    RUN_FAILED=1
  fi
done
if [ "$RUN_FAILED" = 1 ]; then
  echo "Some migrations failed. Check output above. You can run repair alone: psql ... -f migrations/20260215000000_repair_schema.sql"
fi
echo "Done."
