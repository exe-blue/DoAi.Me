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
13. **preset_commands / pc_id 규칙** → UI(또는 API)에서 preset_commands 생성 시 pc_id에 "현재 선택된 PC" 번호(예: PC00, PC-01)를 넣는다. pc_id가 비어있거나 null, 'ALL'이면 아무 PC나 해당 명령을 claim하여 처리할 수 있다(스키마 변경 없이 값 규칙만 적용).
14. **msedgewebview2.exe 강제 종료 금지 (= xiaowei 다운 유발 가능)** → DoAi.Me Desktop은 창 렌더링에 Edge WebView2(msedgewebview2.exe)를 사용한다. 해당 프로세스를 강제 종료하면 앱 프로세스 트리가 끊기거나 창이 죽으며, spawn된 agent 및 xiaowei 연동이 함께 종료될 수 있다. 운영 규칙: msedgewebview2.exe는 작업 관리자에서 강제 종료하지 말 것.

## 웹앱
15. **Supabase Free 플랜** → 1주일 비활성 시 자동 일시중지, Pro($25/월) 권장
16. **Vercel 배포** → `vercel --prod` 또는 Git push
17. **CORS** → Supabase REST API는 브라우저에서 직접 호출 가능 (anon key)

## YouTube 자동 시청
18. **광고 건너뛰기** → 5초 후 우측 하단 (960, 580) 터치, uiautomator로 "건너뛰기" 텍스트 확인
19. **재생 확인** → dumpsys media_session으로 PlaybackState 확인 가능
20. **화면 꺼짐 방지** → 주기적 KEYCODE_WAKEUP 전송 필요
