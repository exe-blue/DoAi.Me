# E2E 채널·컨텐츠 스펙 (Seed + 쿼리 + Playwright)

컨텐츠 화면은 **2줄 캐러셀**, 각 줄 5개(총 10개) 영상을 Supabase에서 조회. Row1과 Row2는 서로 다른 5개씩.  
E2E는 **5개 채널** + **2개 영상**(남아있는 영상 대기열)을 seed로 넣고, Playwright로 개수만 검증.

---

## 1. 테스트 데이터 식별 (충돌 방지)

- 모든 seed 레코드: `test_run_id` (UUID) 또는 `seed_tag = 'e2e_seed'` 공통 부여.
- e2e 시작 시 `test_run_id` 생성 → 삽입/조회/정리 모두 이 값으로만 수행.
- 운영 데이터와 섞이지 않도록 필터 필수.

---

## 2. 채널 5개 (필수)

- 채널 정확히 **5개** 생성.
- 정렬: `created_at desc` 또는 `name asc` 중 **하나로 명시**. UI와 테스트가 동일 정렬 사용.
- 채널 URL(참고):
  - https://www.youtube.com/@SUPERANT_AN
  - https://www.youtube.com/@gamdongstockTV
  - https://www.youtube.com/@closingpricebetting_TV
  - https://www.youtube.com/@realstock_lab
  - https://www.youtube.com/@hanriver_trading

---

## 3. 영상 2개 (필수) — 남아있는 영상(대기열)

- **섹션**: "남아있는 영상(대기열)" 에서만 2개 노출.
- **48시간 규칙**: 모든 작업은 **48시간 이내**만 유효.  
  - **작업가능**: `created_at >= (now() - 48h)`  
  - **작업불가**: `created_at < (now() - 48h)`  
  - 5개는 작업불가, 5개는 작업가능으로 seed 구성 가능(총 10개 영상 중 5개만 대기열 후보).

### 3.1 영상 2개의 쿼리 기준 (고정)

- **1번 영상**: 48시간 이내 중 **가장 최근** 1건 → `ORDER BY created_at DESC LIMIT 1`
- **2번 영상**: 48시간 이내 중 **조회수(completed_views) 가장 높은** 1건 → `ORDER BY completed_views DESC NULLS LAST LIMIT 1`
- 위 두 건이 **서로 다른 행**이 되도록 쿼리(동일 id면 2번째는 다음 순위로).
- 조건: `created_at >= (now() - interval '48 hours')` 및 `test_run_id = $id`(또는 `seed_tag = 'e2e_seed'`).

**쿼리 명세 (2건 조회):**

1. 최신 1건:  
   `WHERE created_at >= (now() - interval '48 hours') AND (test_run_id = $id OR seed_tag = 'e2e_seed') ORDER BY created_at DESC LIMIT 1`
2. 조회수 최고 1건 (위에서 나온 id 제외):  
   동일 WHERE + `AND id != $latest_id` + `ORDER BY COALESCE(completed_views, 0) DESC, created_at DESC LIMIT 1`
3. UI/API는 위 두 쿼리 결과를 합쳐 **정확히 2개** 반환.

---

## 4. Seed 요구사항 요약

| 항목        | 개수 | 비고 |
|------------|------|------|
| 채널       | 5개  | test_run_id 또는 seed_tag 부여 |
| 영상(전체) | 48h 이내 5개 + 48h 밖 5개 등 | 작업가능 5개 중에서 “최신 1 + 조회수 1” = 2개 선택 |
| 대기열 노출 | 2개 | 최신 1건 + completed_views 최고 1건 (서로 다른 행) |

- Seed 직후 검증: 채널 5개 count, 48h 이내 영상에서 “최신 1 + 조회수 1” 2건 조회 가능 여부.  
  실패 시 **즉시 throw** → 테스트 중단.

---

## 5. Playwright assertion (고정)

1. **channels page shows exactly 5 channel items from seed**  
   - `/channels` 이동 → 채널 카드/리스트 **5개**  
   - 예: `expect(page.locator('[data-testid="channel-item"]')).toHaveCount(5)`

2. **channels page shows exactly 2 video items in queue section**  
   - 같은 페이지 “남아있는 영상(대기열)” 섹션에서 영상 카드 **2개**  
   - 예: `expect(page.locator('[data-testid="queue-section"] [data-testid="video-item"]')).toHaveCount(2)`

3. **seed fails when channel or queue video count is not 5 or 2**  
   - seed 후 count/2건 조회 검증에서 5/2가 아니면 throw → 즉시 FAIL.

---

## 6. DB 컬럼 참고

- **videos**: `created_at`, `completed_views`(조회수 대용), `status`, `channel_id`.  
  `test_run_id` / `seed_tag` 는 테스트용 컬럼이 있으면 사용, 없으면 별도 테이블 또는 tags/metadata로 구분.
- **channels**: `id`, `name`, `created_at` 등. 채널에도 test_run_id/seed_tag 적용 시 e2e만 필터 가능.

---

## 7. 2줄 캐러셀(10개)과의 관계

- **운영**: Row1 5개 + Row2 5개 = 10개, 서로 다른 5개씩 Supabase 조회.
- **E2E**: 5 채널 + 대기열 영상 2개만 고정 검증. 캐러셀 10개 로직은 별도 e2e로 권장.
