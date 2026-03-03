# PC 번호 할당 (PC-01, PC-02, …)

## 규칙

- **형식**: `PC-숫자` (예: PC-02, PC-01, PC-02).
- **Supabase**: 중복 없이 **가장 낮은 미사용 숫자**를 배정.
- **한번 등록된 번호는 재사용하지 않음**: 해당 PC가 삭제되거나 오프라인이 되어도, 그 번호는 제외하고 다음 빈 번호를 사용.

## DB

- **테이블** `pc_number_allocations (num INT PRIMARY KEY)`: 이미 사용된 숫자만 저장 (0, 1, 2, …). 삭제하지 않음.
- **함수** `get_next_pc_number()`: 사용 가능한 가장 작은 숫자를 찾아 `pc_number_allocations`에 INSERT 후 `'PC-' || LPAD(num, 2, '0')` 반환.

## 사용처

- Agent 또는 대시보드에서 **새 PC(worker) 등록** 시:
  1. `SELECT get_next_pc_number();` 호출 → 예: `'PC-02'`.
  2. `workers` 행 생성/갱신 시 `display_name = 'PC-02'`, `hostname = 실제 호스트명`.
- UI 표기: **"PC-02 (hostname)"** 형태로 표시 (Ops 페이지 등).

## 마이그레이션

- `supabase/migrations/20260303110000_pc_number_allocations.sql` 적용 후 `get_next_pc_number()` 사용 가능.
