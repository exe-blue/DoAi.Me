-- RPC: Register a new PC and return its pc_number (e.g. 'PC-01').
-- Uses FOR UPDATE in a single transaction so concurrent agents get unique numbers.
-- Caller (agent) saves the returned pc_number to local store and uses it on subsequent runs.

CREATE OR REPLACE FUNCTION register_new_pc()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num INT;
  new_pc_number TEXT;
BEGIN
  -- Serialize concurrent calls (works even when pcs table is empty)
  PERFORM pg_advisory_xact_lock(hashtext('register_new_pc'));

  -- Next number: max(numeric part of pc_number) + 1, or 1 if no rows
  SELECT COALESCE(MAX(
    NULLIF(REGEXP_REPLACE(pc_number, '[^0-9]', '', 'g'), '')::INT
  ), 0) + 1
  INTO next_num
  FROM pcs;

  new_pc_number := 'PC-' || LPAD(next_num::TEXT, 2, '0');

  INSERT INTO pcs (pc_number, status)
  VALUES (new_pc_number, 'online');

  RETURN new_pc_number;
END;
$$;

COMMENT ON FUNCTION register_new_pc() IS 'Assigns next PC number (PC-01, PC-02, ...) and inserts one row. Safe for concurrent calls. Agent stores returned pc_number locally (e.g. agent/data/pc.json).';
