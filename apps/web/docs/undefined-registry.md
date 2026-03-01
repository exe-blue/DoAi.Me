# 미정의 항목 레지스트리 (U1~U8)

Events/Logs에서 "정의되지 않은 것(Unknown/Undefined)"을 숨기지 않고 안전하게 표시하기 위한 규칙과 TODO 목록.

---

## 1. 미정의 항목 (U1~U8)

| ID | 항목 | 설명 | UI 처리 규칙 |
|----|------|------|----------------|
| U1 | eventType | API에 event_type 없거나 카탈로그에 없음 | **Unknown**으로 표시, Type 컬럼/상세에 "Unknown", WARN 스타일 |
| U2 | level | level 필드 없거나 비표준 값 | 원문 그대로 표시, 알 수 없으면 "unknown" |
| U3 | message | message 없음/빈 문자열 | "(empty)" 표시 |
| U4 | payload | 비정형/알 수 없는 구조 | 상세에서 "Payload (raw)"로 JSON 전체 표시, 복사 가능 |
| U5 | task_id | 없음 | "—" 표시 |
| U6 | device_serial | 없음 | "—" 표시 |
| U7 | created_at | 없음 | "(no time)" 또는 서버 수신 시각 사용 |
| U8 | id | 없음 | `created_at + message` 등으로 합성 ID 표시 |

- **Include Undefined** 토글: U1/U4 등 미정의 이벤트를 목록에 포함할지 여부. 기본값 **ON**(포함).

---

## 2. UI 처리 규칙 요약

- Unknown/Undefined를 **숨기지 않음**. "Unknown", "(empty)", "—" 등으로 명시 표시.
- eventType이 Unknown이거나 payload가 비정형이면 해당 행을 **WARN** 시각(배경/아이콘)으로 구분.
- 상세 Drawer에서 **원문 JSON** 항상 제공(복사 가능).
- 이슈 템플릿 복사 시 8개 항목에 선택 이벤트 정보를 채워 클립보드에 넣음.

---

## 3. 필요한 정보 / TODO (새 API/데이터 생성 없이)

| ID | 필요한 정보 | 현재 | TODO |
|----|-------------|------|------|
| U1 | eventType 소스 | API에 없음, 메시지 유추 시도 | 메시지 패턴 또는 추후 API 필드로 유추 로직 보강 |
| U2 | level 허용 값 | API level 사용 | 비표준 값 수신 시 그대로 표시 |
| U4 | payload 스키마 | 없음 | 정형화하지 않고 raw만 표시 |
| U7 | created_at 대체 | API created_at 사용 | 없으면 클라이언트 수신 시각 (TODO) |

- **새 테이블/API/스키마는 만들지 않음.** 기존 GET /api/logs 응답만 사용하고, 부족한 필드는 stub 또는 클라이언트 유추 + TODO로 처리.
