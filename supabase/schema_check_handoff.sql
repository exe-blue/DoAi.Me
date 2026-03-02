-- Schema verification for deployment-database-manager-handoff.md
-- Run: npx supabase db execute --file supabase/schema_check_handoff.sql

-- A. devices columns
SELECT 'A.devices_columns' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'devices'
ORDER BY ordinal_position;

-- A. devices unique/primary constraints
SELECT 'A.devices_constraints' AS section;
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.devices'::regclass AND contype IN ('u','p');

-- B. task_devices columns
SELECT 'B.task_devices_columns' AS section;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'task_devices'
ORDER BY ordinal_position;

-- B. RPCs
SELECT 'B.rpcs' AS section;
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND proname IN (
    'claim_task_devices_for_pc',
    'claim_next_task_device',
    'complete_task_device',
    'fail_or_retry_task_device'
  )
ORDER BY proname;

-- C. pcs table
SELECT 'C.pcs_columns' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pcs'
ORDER BY ordinal_position;
