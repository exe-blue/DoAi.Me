# DoAi.Me 아키텍처

## 시스템 구성

```
[Supabase DB]
    ├── channels (YouTube 채널 목록)
    ├── videos (시청할 영상 목록, status=active)
    ├── jobs (시청 작업 단위)
    ├── job_assignments (디바이스별 할당)
    ├── devices (Galaxy S9 목록)
    └── pcs (노드 PC 목록)

[Next.js 웹앱 - Vercel]
    ├── 대시보드 UI
    ├── 채널/영상 관리 API
    └── 크론: 새 영상 자동 수집

[Agent - Windows PC]
    ├── VideoDispatcher (60s): videos → jobs + assignments 생성
    ├── TaskExecutor (15s): pending assignments → YouTube 시청 실행
    ├── Heartbeat (30s): PC/디바이스 상태 보고
    ├── DeviceWatchdog (60s): 디바이스 연결 감시
    └── ADB Reconnect (60s): 끊긴 디바이스 재연결

[Xiaowei - Windows 앱]
    ├── WebSocket API (ws://127.0.0.1:22222/)
    ├── ADB Bridge → Galaxy S9
    └── 디바이스 목록/상태 관리
```

## 데이터 플로우

```
1. 웹앱에서 채널 등록 → channels 테이블
2. 크론/수동으로 영상 수집 → videos 테이블 (status=active)
3. Agent의 VideoDispatcher가 active 영상 감지
4. jobs + job_assignments 자동 생성 (디바이스별 1개씩)
5. TaskExecutor가 pending assignment 폴링
6. Xiaowei adbShell로 YouTube URL 열기
7. 설정된 duration만큼 시청 (광고 스킵 포함)
8. completed로 마킹
9. target_views 미달이면 VideoDispatcher가 추가 assignment 생성
10. 반복
```

## Agent 실행 환경
- OS: Windows 10/11 (WSL 아님!)
- 경로: `C:\Users\choi\doai-agent\`
- Node.js: CommonJS
- Xiaowei: config.toml에 `[websocket] port=22222` 필수
- 환경변수: `.env` 파일

## 규모 계획
- PC 1대당 Galaxy S9 20대 (USB 허브)
- 노드 PC 5대 = 100대
- 최종 목표: 500대 (노드 PC 25대)
- PC 번호: PC00 ~ PC99
- 디바이스 번호: 001 ~ 999
