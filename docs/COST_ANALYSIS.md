# 비용 & 데이터 관리 분석

> 운영 전 반드시 확인. 예상 못한 비용 폭탄은 프로젝트를 죽인다.

---

## 1. Supabase 비용

### 1.1 DB 사이즈 예측 (일간)

| 테이블 | 계산 | rows/일 | row 크기 | 일간 증가 |
|--------|------|---------|---------|----------|
| `job_assignments` | 500대 × 40회 | ~20,000 | ~200B | ~4MB |
| `execution_logs` | ERROR만 (전체의 ~5%) | ~1,000 | ~500B | ~0.5MB |
| `tasks` | 20 영상 × 1 task | ~20 | ~300B | 무시 |
| `devices` | upsert (증가 안 함) | 500 (고정) | ~200B | 0 |
| `pcs` | 5 (고정) | 5 | ~100B | 0 |

**⚠️ 하트비트 주의:**
```
500대 × 30초 = 1,440,000 rows/일 ← DB에 쌓으면 1주일에 10M rows
```

**대응**: 하트비트는 `pcs.last_heartbeat` + `devices.last_seen_at` 업데이트만 (INSERT 아님).
현재 구현이 이미 이렇게 되어 있음 ✅

**월간 DB 증가 추정:**
```
  job_assignments: ~4MB × 30 = ~120MB/월
  execution_logs:  ~0.5MB × 30 = ~15MB/월
  ────────────────────────────
  총: ~135MB/월
```

### 1.2 보관 정책 (DB 폭발 방지)

| 테이블 | 보관 기간 | 정리 방법 |
|--------|----------|----------|
| `execution_logs` | **7일** | pg_cron DELETE (이미 설정됨) |
| `job_assignments` (completed) | **30일** | pg_cron 월초 정리 |
| `task_logs` | **7일** | pg_cron (이미 설정됨) |
| `command_logs` | **60일** | pg_cron (이미 설정됨) |
| `tasks` (completed) | **30일** | 수동 또는 pg_cron |

### 1.3 Supabase Plan 비교

| 항목 | Free | Pro ($25/월) | 현재 필요 |
|------|------|-------------|----------|
| DB 크기 | 500MB | 8GB | **Pro** (월 135MB 증가) |
| Realtime 동시접속 | 200 | 500 | Pro 권장 (5 Agent + 대시보드) |
| Edge Functions | 500K/월 | 2M/월 | Free 충분 |
| DB 연결 수 | 60 | 200 | Pro 권장 (5 Agent × 다중 쿼리) |
| 일시중지 | 1주 비활성시 | 없음 | **Pro 필수** (24시간 운영) |
| 비용 | $0 | **$25/월** | |

**결론: Pro Plan 필수 ($25/월)**

### 1.4 필수 인덱스

```sql
-- 이미 있는 인덱스
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_tasks_status ON tasks(status);

-- 추가 권장 (polling 성능)
CREATE INDEX IF NOT EXISTS idx_job_assignments_status_device
  ON job_assignments(status, device_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_job_status
  ON job_assignments(job_id, status);
CREATE INDEX IF NOT EXISTS idx_videos_status_priority
  ON videos(status, priority DESC);
```

---

## 2. Vercel 비용

| 항목 | Free (Hobby) | Pro ($20/월) | 예상 사용량 |
|------|-------------|-------------|-----------|
| Serverless 실행 | 100GB-hrs | 1000GB-hrs | 대시보드 호출 ~50GB-hrs |
| 대역폭 | 100GB | 1TB | ~10GB (API + 프론트) |
| Edge Functions | 500K | 1M | ~100K |
| Cron Jobs | — | 지원 | 채널 동기화 1회/분 |

**결론: 초기 Free 가능, 트래픽 증가 시 Pro ($20/월)**

---

## 3. 기타 월간 비용

| 항목 | 예상 비용 | 비고 |
|------|----------|------|
| **Supabase Pro** | $25/월 | 필수 |
| **Vercel** | $0~20/월 | 초기 Free |
| **프록시** | $50~200/월 | Residential 100개 기준 |
| **계정 보충** | 가변 | 월 200개 × 단가 |
| **OpenAI API** | $2~5/월 | gpt-4o-mini, 댓글 ~1,000건/일 × ₩1~2 |
| **SplashTop** | $0~50/월 | 비즈니스 라이센스 여부 |
| **전기세** | ~$30~50/월 | PC 5대 (각 ~150W) + 기기 500대 (각 ~5W) |
| **YouTube API** | $0 | 일 10,000 units 무료 쿼터 내 |

### 월간 총 비용 예상

```
  최소: $107/월 (Supabase + 프록시 최소 + 전기)
  일반: $180~300/월
  최대: $400+/월 (프록시 고급 + 계정 대량 보충)
```

---

## 4. OpenAI API 비용 상세

```
gpt-4o-mini 가격: $0.15/1M input tokens, $0.60/1M output tokens

댓글 1건:
  입력: ~150 tokens (system prompt + 영상 제목)
  출력: ~30 tokens (댓글 1~2문장)
  비용: ~$0.0000405/건 ≈ ₩0.06/건

일 1,000건: ~₩60/일 = ~₩1,800/월
일 5,000건: ~₩300/일 = ~₩9,000/월
```

---

## 5. YouTube Data API 쿼터

```
일일 무료 쿼터: 10,000 units

사용량:
  videos.list (인기 영상):     100 units × 3 카테고리 = 300
  channels.list (채널 정보):   1 unit × 20 채널 = 20
  search.list (채널 영상):     100 units × 20 채널 = 2,000
  ─────────────────────────
  워밍업 풀 갱신: ~2,320 units (1일 1회)
  영상 정보 조회: ~100 units (필요시)
  ─────────────────────────
  일일 총: ~2,500 units (쿼터의 25%)
```

**충분. 추가 비용 없음.**

---

## 6. 데이터 모니터링

### Supabase DB 크기 확인 (주간)
```sql
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size,
  pg_total_relation_size(schemaname || '.' || tablename) AS raw_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY raw_bytes DESC;
```

### 테이블별 row 수 확인
```sql
SELECT
  relname AS table,
  n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```

### 30일 이상 완료된 데이터 정리
```sql
-- job_assignments 30일 이상 정리
DELETE FROM job_assignments
WHERE status IN ('completed', 'failed')
  AND completed_at < NOW() - INTERVAL '30 days';

-- execution_logs 7일 이상 정리
DELETE FROM execution_logs
WHERE created_at < NOW() - INTERVAL '7 days';
```
