-- Run in Supabase Dashboard SQL Editor (linked project: see package.json db:link).
-- 1) Devices table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'devices'
ORDER BY ordinal_position;

-- 2) Unique constraints on devices (for upsert onConflict)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.devices'::regclass AND contype = 'u';
