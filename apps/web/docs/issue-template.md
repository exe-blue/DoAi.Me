# 이슈 보고 템플릿

Events/Logs에서 발생한 문제를 보고할 때 아래 8개 항목을 반드시 채워 제출한다.

---

## 필수 8개 항목

1. **제목 (Title)**  
   한 줄 요약 (예: `[Events] task_logs level=error 증가`)

2. **발생 시각 (Occurred At)**  
   이벤트의 `created_at` 또는 관측 시각 (ISO 8601 권장)

3. **심각도 (Level)**  
   `debug` | `info` | `warn` | `error` | `fatal`

4. **이벤트 타입 (Event Type)**  
   카탈로그 타입 또는 `Unknown`

5. **관련 엔티티 (Task ID / Device serial)**  
   `task_id`, `device_serial` 또는 —

6. **요약 (Summary)**  
   무엇이 잘못되었는지 2~3문장

7. **재현 절차 (Steps)**  
   가능한 경우 재현 단계 (번호 목록)

8. **원문 페이로드 (Raw Payload)**  
   상세 뷰의 JSON 전체 (복사하여 붙여넣기)

---

## 복사용 블록 (클립보드 복사 시 아래 형식으로 채움)

```
Title: 
Occurred At: 
Level: 
Event Type: 
Task ID / Device: 
Summary: 
Steps: 
Raw Payload: 
```
