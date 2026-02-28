-- ============================================================
-- Schema verification for docs/deployment-database-manager-handoff.md
-- Run in Supabase Dashboard SQL Editor (linked project: see package.json db:link).
-- Use results to confirm: devices (serial_number, pc_id, last_heartbeat),
-- task_devices, pcs, and RPCs match the handoff assumptions.
-- ============================================================

-- 1) devices table columns
SELECT 'devices columns' AS check_name;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'devices'
ORDER BY ordinal_position;

-- 2) devices unique constraints (for upsert onConflict)
SELECT 'devices unique constraints' AS check_name;
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.devices'::regclass AND contype IN ('u', 'p');

-- 3) task_devices table columns
SELECT 'task_devices columns' AS check_name;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'task_devices'
ORDER BY ordinal_position;

-- 4) pcs table existence and key columns
SELECT 'pcs columns' AS check_name;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pcs'
ORDER BY ordinal_position;

-- 5) RPCs required by handoff: claim_task_devices_for_pc, claim_next_task_device, complete_task_device, fail_or_retry_task_device
SELECT 'RPCs (handoff)' AS check_name;
SELECT proname AS function_name, pg_get_function_arguments(oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND proname IN ('claim_task_devices_for_pc', 'claim_next_task_device', 'complete_task_device', 'fail_or_retry_task_device')
ORDER BY proname;
