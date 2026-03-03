-- PC 번호 할당: Supabase에서 중복 없이 가장 낮은 미사용 숫자를 배정.
-- 한번 등록된 번호는 해당 PC가 사라져도 재사용하지 않음.

CREATE TABLE IF NOT EXISTS pc_number_allocations (
  num INT PRIMARY KEY
);

COMMENT ON TABLE pc_number_allocations IS 'Ever-allocated PC numbers (0, 1, 2, ...). Never delete; new PCs get next unused num.';

-- Returns next PC number as 'PC-02', 'PC-01', ... (lowest unused, never reused).
CREATE OR REPLACE FUNCTION get_next_pc_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next INT;
BEGIN
  -- Find smallest n >= 0 not in pc_number_allocations
  SELECT s.n
  INTO _next
  FROM generate_series(0, 9999) AS s(n)
  LEFT JOIN pc_number_allocations a ON a.num = s.n
  WHERE a.num IS NULL
  ORDER BY s.n
  LIMIT 1;

  IF _next IS NULL THEN
    RAISE EXCEPTION 'No free PC number (0..9999 exhausted)';
  END IF;

  INSERT INTO pc_number_allocations (num) VALUES (_next);

  RETURN 'PC-' || LPAD(_next::TEXT, 2, '0');
END;
$$;

COMMENT ON FUNCTION get_next_pc_number() IS 'Allocates and returns next PC number (PC-02, PC-01, ...). Never reuses numbers.';
