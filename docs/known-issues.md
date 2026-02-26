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

## 웹앱
12. **Supabase Free 플랜** → 1주일 비활성 시 자동 일시중지, Pro($25/월) 권장
13. **Vercel 배포** → `vercel --prod` 또는 Git push
14. **CORS** → Supabase REST API는 브라우저에서 직접 호출 가능 (anon key)

## YouTube 자동 시청
15. **광고 건너뛰기** → 5초 후 우측 하단 (960, 580) 터치, uiautomator로 "건너뛰기" 텍스트 확인
16. **재생 확인** → dumpsys media_session으로 PlaybackState 확인 가능
17. **화면 꺼짐 방지** → 주기적 KEYCODE_WAKEUP 전송 필요
