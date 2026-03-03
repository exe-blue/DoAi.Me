# 알려진 이슈 & 주의사항

## DB 스키마
1. **job_assignments에 updated_at 없음** → `.update({...})` 시 updated_at 필드 절대 포함하지 말 것
2. **accounts, proxies 테이블 미생성** → 관련 에러 로그는 정상, 무시
3. **videos.id = YouTube Video ID** (text), UUID 아님 → URL 생성 시 직접 사용 가능
4. **channels.id = YouTube Channel ID** (text), UUID 아님
5. **subscriber_count는 문자열** (text) → parseInt 필요

## Agent / Xiaowei
6. **tap(50, 50)은 상태바** → 앱관리자 열림. `input tap 540 350` 사용
7. **Xiaowei tap() vs ADB input tap** → ADB가 더 안정적, ADB 우선 사용
8. **uiautomator dump는 1~3초 소요** → 너무 자주 호출하면 성능 저하
9. **WSL에서 Xiaowei 접근 불가** → Agent는 반드시 Windows PowerShell에서 실행
10. **Xiaowei WebSocket 비활성화 기본값** → `%APPDATA%\xiaowei_wecan88888\config.toml`에 수동 추가:
    ```toml
    [websocket]
    port = 22222
    switch = true
    ```
11. **Xiaowei VIP 필요** → 회원 활성화 안 되면 code=10001 에러
12. **포트 킬(port kill) 금지** → 포트를 닫기 위해 프로세스를 강제 종료하면 xiaowei.exe 등 서버 프로세스가 죽어 WebSocket(22222)이 끊긴다. 포트 충돌 시 해당 포트를 쓰는 프로세스를 정상 종료하거나 설정을 바꿔 재시작할 것.
13. **preset_commands / pc_id 규칙** → UI(또는 API)에서 preset_commands 생성 시 pc_id에 "현재 선택된 PC" 번호(예: PC-02, PC-01)를 넣는다. pc_id가 비어있거나 null, 'ALL'이면 아무 PC나 해당 명령을 claim하여 처리할 수 있다(스키마 변경 없이 값 규칙만 적용).
14. **msedgewebview2.exe 강제 종료 금지 (= xiaowei 다운 유발 가능)** → DoAi.Me Desktop은 창 렌더링에 Edge WebView2(msedgewebview2.exe)를 사용한다. 해당 프로세스를 강제 종료하면 앱 프로세스 트리가 끊기거나 창이 죽으며, spawn된 agent 및 xiaowei 연동이 함께 종료될 수 있다. 운영 규칙: msedgewebview2.exe는 작업 관리자에서 강제 종료하지 말 것.
15. **Desktop Agent env (PC_NUMBER / Supabase)** → PC_NUMBER는 Settings에서 지정한 값이 agent-settings.json에 저장된 뒤 다음 spawn부터 전달된다. 첫 실행 시에는 비어 있어 "Missing env: PC_NUMBER"가 나올 수 있음. Supabase "Invalid API key"는 패키징 시 resources/.env(또는 resources/agent/.env)에 SUPABASE_URL, SUPABASE_ANON_KEY가 있어야 하며, Agent의 config.js는 dotenv override: false로 spawn env가 .env보다 우선하도록 되어 있음.

## 웹앱
16. **Supabase Free 플랜** → 1주일 비활성 시 자동 일시중지, Pro($25/월) 권장
17. **Vercel 배포** → `vercel --prod` 또는 Git push
18. **CORS** → Supabase REST API는 브라우저에서 직접 호출 가능 (anon key)

## YouTube 자동 시청
19. **광고 건너뛰기** → 5초 후 우측 하단 (960, 580) 터치, uiautomator로 "건너뛰기" 텍스트 확인
20. **재생 확인** → dumpsys media_session으로 PlaybackState 확인 가능
21. **화면 꺼짐 방지** → 주기적 KEYCODE_WAKEUP 전송 필요

---

## 웹 대시보드 — 데이터 스트림에 해당하지 않거나 비어 있을 수 있는 항목

아래는 **현재 화면에 있는 메뉴/출력 중** 실제 데이터 스트림과 1:1로 연결되지 않았거나, 비어 있을 때 **어디서 찾을지·어떤 오류를 의심할지** 정리한 목록이다.

| # | 메뉴 또는 화면 출력명 | 데이터 소스 (어디서 찾는지) | 비어 있거나 잘못 나올 때 의심할 것 |
|---|------------------------|-----------------------------|-------------------------------------|
| 1 | **Operations** > "대상 PC" (Preset commands 드롭다운) | `v_worker_summary` 또는 `workers` 테이블 (`getWorkers()`) | Agent가 `pcs` 테이블에만 등록하고 `workers`/뷰는 비어 있음. 또는 RLS로 select 불가. |
| 2 | **Operations** > "Online devices" | `v_worker_summary.devices_online` + `devices.status='online'` 집계 (`getKpis()`) | `workers`/`devices` 없음, 또는 뷰/RLS로 빈 결과. |
| 3 | **Operations** > "Warning devices" | `devices` 테이블에서 status=`error`/`warning` 개수 | 위와 동일. |
| 4 | **Operations** > "Last heartbeat" | `workers.last_heartbeat` (또는 v_worker_summary) 최신값 | Agent가 `pcs.last_heartbeat`만 갱신하고 `workers`는 미갱신. 또는 워커 0명. |
| 5 | **Operations** > "Success / Failure" | `task_devices` 테이블, `status='done'` / `'failed'`, 최근 24h (`completed_at`/`updated_at`) | `task_devices` 없음, 또는 status 값이 `done`/`failed`가 아님(다른 enum 값). |
| 6 | **Operations** > "Alerts" | `system_events` 테이블 (`getAlerts()`) | `system_events`에 insert하는 트리거/Agent 로직이 없음. 또는 RLS로 select 불가. |
| 7 | **Operations** > "Preset commands" pending 목록 | `preset_commands` 테이블, `status='pending'` | 마이그레이션 `20260303100000_preset_commands_table.sql` 미적용. 또는 RLS로 insert/select 불가. |
| 8 | **Operations** > "Filter by PC number, serial, or IP…" (검색 입력란) | **연결 안 됨** — `filter` state만 있고, getDevices/리스트 refetch에 `q` 파라미터로 넘기지 않음 | 데이터 스트림에 해당하지 않음. 기기 목록이 Ops 본문에 없어서 필터만 단독으로 있음. |
| 9 | **Operations** > "Logs (PC별)" | `task_logs` 테이블, `worker_id = 선택한 PC의 workers.id` | `task_logs`에 `worker_id`가 채워지지 않고 insert되면 해당 PC로 필터해도 빈 목록. |
| 10 | **Devices** (메뉴) | `devices` 테이블 (`getDevices()`) | 테이블 비어 있음 또는 RLS. |
| 11 | **Tasks** (메뉴) | `tasks` + `videos` + `channels` (`getTasksWithDetails()`) | 테이블 비어 있음 또는 RLS. |
| 12 | **Events** (메뉴) | `task_logs` 테이블 | 테이블 비어 있음 또는 RLS. |
| 13 | **Errors** (메뉴) | `task_logs` 테이블, `level='error'` | 위와 동일. 에러 로그가 아직 없으면 빈 목록. |
| 14 | **YouTube** > Channels | `channels` 테이블 (서버 `getAllChannels()` + Realtime) | 테이블 비어 있음 또는 RLS. |
| 15 | **YouTube** > Contents | `videos` + `channels(name)` (`getContents()`) | 위와 동일. |
| 16 | **Settings** > "Supabase connection" | `settings` 테이블 `limit 1` 쿼리로 헬스 체크 | anon key로 `settings` select 불가(RLS). 또는 테이블 없음. |

### 요약 (데이터 스트림 미연결 또는 특수 케이스)

- **완전 미연결**: **8번** "Filter by PC number, serial, or IP…" — 어디에도 쿼리 파라미터로 전달되지 않음.
- **테이블/뷰 불일치 가능**: **1, 4번** — 계획서는 워커/PC를 `pcs`로 기술하나, 구현은 `workers`/`v_worker_summary` 사용. Agent가 `pcs`만 채우면 워커 목록·Last heartbeat가 빈 상태로 나올 수 있음.
- **데이터 채우는 쪽이 없을 수 있음**: **6번** Alerts(`system_events`), **9번** Logs(PC별 `task_logs.worker_id`) — 해당 테이블에 insert하는 애플리케이션/트리거가 없으면 항상 빈 목록.
