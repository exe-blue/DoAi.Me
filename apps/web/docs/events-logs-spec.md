# Events / Logs — 필터 및 표시 규격

내부 운영용 Events/Logs 페이지의 필터, 테이블, 상세 뷰, 요약 규칙을 정의한다.  
DB/API 스키마는 변경하지 않으며, 데이터는 services/eventsService 어댑터를 통해서만 접근한다.

---

## 1. 필터 규격

| 필터 | 타입 | 설명 | API 지원 | 비고 |
|------|------|------|----------|------|
| **시간** | start / end (ISO 8601 또는 preset) | 이벤트 발생 구간 | before만 지원 시 클라이언트 필터 | preset: 1h, 6h, 24h, 7d |
| **심각도** | level | debug, info, warn, error, fatal | GET /api/logs?level= | 복수 선택 가능(쉼표) |
| **타입** | eventType | 카탈로그 타입(heartbeat, inventory, diff, sync, anomaly, unknown) | 없으면 클라이언트 유추 또는 unknown | 미정의 시 Unknown |
| **엔티티** | task_id, device_id | 태스크/디바이스로 필터 | task_id, device_id 쿼리 지원 | 없으면 — 표시 |
| **검색** | search (message) | 메시지 전문 검색 | search (ilike) 지원 | 대소문자 구분 없음 |
| **Include Undefined** | boolean | eventType/payload 미정의 이벤트 포함 여부 | N/A, 클라이언트 필터 | 기본값 **ON** (미정의도 표시) |

- **Unknown / Undefined**: eventType이 카탈로그에 없거나 payload 구조가 비정형이면 Unknown으로 분류하고, Include Undefined가 OFF일 때 목록에서 제외할 수 있음. 기본은 ON으로 미정의 이벤트도 노출.

---

## 2. 테이블 컬럼

| 컬럼 | 설명 | 미정의/없을 때 표시 |
|------|------|----------------------|
| Time | created_at (로컬 포맷) | — |
| Level | debug / info / warn / error / fatal | 원문 그대로, 알 수 없으면 "unknown" |
| Type | eventType (카탈로그 또는 Unknown) | **Unknown** (WARN 스타일) |
| Message | message (일부 truncate) | 원문, 비어 있으면 "(empty)" |
| Task / Device | task_id 또는 device_serial | — |
| | 상세 버튼 / 행 클릭 → Drawer | |

- Type이 Unknown이거나 payload가 비정형이면 해당 행을 WARN 시각(예: 주황 배경 또는 경고 아이콘)으로 구분하고, 상세에서 원문 JSON 보기 제공.

---

## 3. 상세 뷰 (Drawer)

- **제목**: Event detail — [eventType 또는 Unknown] (id 또는 시간)
- **필드**: Time, Level, Type, Message, Task ID, Device serial, Payload(원문 JSON)
- **Unknown/비정형 payload**: "Payload (raw)" 섹션에 JSON 전체 표시, 복사 가능.
- **이슈 템플릿 복사**: 선택 이벤트로 issue-template.md 8개 항목을 채워 클립보드에 복사.

---

## 4. 요약 규칙

- **레벨별 집계**: level별 건수 표시(선택). API에 집계가 없으면 클라이언트에서 계산.
- **Unknown 건수**: eventType이 Unknown인 건수 표시(Include Undefined ON일 때).
- **마지막 N건**: 기본 limit 200, 최대 1000 (API 상한 준수).

---

## 5. 이벤트 카탈로그 (타입)

정의된 eventType만 카탈로그로 인식하고, 그 외는 Unknown.

| eventType | 설명 |
|-----------|------|
| heartbeat | 기기/워커 heartbeat 이벤트 |
| inventory | 디바이스 인벤토리 변경 |
| diff | 설정/상태 diff |
| sync | 동기화 시작/완료/실패 |
| anomaly | 이상 징후 |
| unknown | 위에 해당하지 않거나 미정의 |

- API가 eventType 필드를 제공하지 않으면 메시지/raw에서 유추 시도하고, 실패 시 **Unknown**으로 표시(숨기지 않음).

---

## 6. 시간 preset (클라이언트)

API에 time range가 없으면 클라이언트에서만 적용.

| Preset | 적용 |
|--------|------|
| 1h / 6h / 24h / 7d | timeStart ~ timeEnd 구간으로 클라이언트 필터 |
| All | 시간 필터 없음 |
