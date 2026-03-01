# Cursor 단계별 실행 프롬프트 — 모노레포 / DX / 패키징

내부용. Electron+React, Next 대시보드, git pull+node start 제거, 업데이트+진단 필수 상황에 맞춘 프롬프트 6개와 체크리스트(Step 1~6).

---

## Step 1 — 모노레포 표준 구조로 정리(폴더 리셋)

### Cursor 프롬프트

```
너는 모노레포 리팩토링 전문가다.
목표: 현재 레포의 난잡한 구조를 최신 정석 monorepo로 정리한다.
스택: pnpm workspace + turborepo, apps/web(Next.js), apps/desktop(Electron+React).

규칙(반드시 지켜라):
- 배포 단위는 apps/* 로 고정: apps/web, apps/desktop
- 공유 코드는 packages/*
- Next.js App Router의 app 폴더는 apps/web/app 로 존재해야 한다 (app/app 중첩 제거)
- 루트에 남아있는 components/hooks/lib/public 같은 웹 전용 폴더는 apps/web로 이동
- node_modules, .pnpm-store, .next, dist, build, out, coverage, .turbo 등은 레포에서 제거하고 .gitignore에 추가
- legacy나 샘플(app_legacy, getting-started-*)은 archive/로 이동하거나 apps/web-legacy처럼 별도 앱으로 격리

작업:
1) 현재 폴더를 "이동/삭제/유지"로 분류하고 근거를 1줄씩 작성해라.
2) app/app 중첩을 제거하도록 루트 app을 apps/web로 이동하고, 필요한 경로 수정(최소)만 수행해라.
3) pnpm-workspace.yaml, turbo.json, 루트 package.json 스크립트를 정리하여 pnpm -w dev/build/lint/test 기본 골격을 만든다.
4) 변경 후에도 web이 단독으로 실행되도록 Next 설정을 최소 수정해라.

출력:
- 최종 파일 트리
- 이동/삭제/유지 목록
- 깨질 수 있는 포인트와 확인 방법
```

### 완료 체크리스트 (Step 1)

- [ ] 루트에 apps/web, apps/desktop, packages/* 가 보인다
- [ ] apps/web/app가 존재하고, 더 이상 app/app 중첩이 없다
- [ ] 루트 node_modules, .pnpm-store가 git에 남지 않는다
- [ ] pnpm -w dev에서 web이 최소 실행된다(데스크톱은 아직 뼈대여도 OK)

---

## Step 2 — Dev 안정화(재시작 지옥 해결: renderer HMR + main 재시작 분리)

### Cursor 프롬프트

```
너는 Electron + React 개발환경(DX) 최적화 전문가다.
목표: apps/desktop에서 renderer는 HMR로 재시작 없이 개발하고, main/preload 변경 시에만 Electron이 자동 재시작되게 만든다.

요구사항:
1) apps/desktop을 main / preload / renderer로 분리한 구조로 구성한다.
2) renderer는 Vite + React + TS로 구성, HMR 동작.
3) main/preload도 번들링/빌드 파이프라인에 포함되게 구성.
4) Electron 보안 기본값 준수:
   - nodeIntegration: false, contextIsolation: true
   - preload에서 contextBridge로 필요한 API만 노출
5) turborepo dev 파이프라인에서:
   - desktop dev(전자앱 실행)
   - web dev(Next)
   - packages/shared watch(있다면)
   를 병렬 실행하고 dev는 cache:false, persistent:true.

출력:
- 어떤 변경이 어떤 재시작을 유발하는지 규칙 표
- pnpm -w dev 한 줄로 모두 띄우는 방법
```

### 완료 체크리스트 (Step 2)

- [ ] renderer UI 변경 시 Electron 재시작 없이 반영된다(HMR)
- [ ] main/preload 변경 시에만 Electron이 자동 재시작된다
- [ ] pnpm -w dev가 web + desktop을 함께 띄운다

---

## Step 3 — 패키징(Installer) 먼저: 내부 테스트 배포 루프 완성

### Cursor 프롬프트

```
너는 Windows Electron 패키징 전문가다.
목표: apps/desktop을 Windows 설치파일(NSIS)로 패키징하여 내부 테스터가 git pull 없이 설치/실행하게 만든다.

요구사항:
1) electron-builder 기반으로 구성하고 Windows target은 NSIS 사용.
2) 산출물 폴더를 표준화(dist/ 또는 release/ 등)하고 turbo build outputs에 반영.
3) 명령 분리:
   - desktop:build (번들 빌드)
   - desktop:dist  (installer 생성)
4) 루트에서 실행:
   - pnpm --filter desktop build
   - pnpm --filter desktop dist
   가 동작해야 한다.

출력:
- 내부 테스터용 배포물 생성 커맨드 3줄
- 산출물 위치/파일명
- 흔한 오류(코드사인/권한/경로)와 해결 힌트
```

### 완료 체크리스트 (Step 3)

- [ ] 설치파일(.exe)이 생성된다
- [ ] 다른 PC(또는 깨끗한 환경)에서도 설치/실행된다
- [ ] 테스터는 소스/Node 없이 앱을 실행할 수 있다

---

## Step 3 구현 요약 (참고)

- **내부 테스터용 배포물 생성 커맨드 3줄**
  1. `pnpm -w desktop:build`  (또는 `pnpm --filter @doai/client build`) — 번들만 빌드
  2. `pnpm -w desktop:dist`   (또는 `pnpm --filter @doai/client dist`) — NSIS 설치 파일 생성
  3. 배포: `apps/desktop/release/` 아래 `.exe` 파일 전달

- **산출물 위치/파일명**
  - 번들: `apps/desktop/dist/`, `apps/desktop/dist-electron/`
  - 설치 파일: `apps/desktop/release/` (electron-builder `directories.output`), 예: `DoAi Agent Setup x.x.x.exe`

- **흔한 오류와 해결 힌트**
  - **코드사인**: 서명 없이 배포 시 Windows 스마트스크린 경고 가능. 내부 테스트는 “추가 정보 → 실행”으로 진행. 정식 배포 시 코드사인 인증서 적용.
  - **권한**: `release/` 생성 시 쓰기 권한 필요. 빌드가 끝나면 `release/`는 .gitignore 대상.
  - **경로**: 반드시 `desktop:build` 후 `desktop:dist` 실행. dist가 없으면 electron-builder가 실패함.
  - **Windows 전용**: `electron-builder --win`은 Windows에서만 설치 파일 생성. macOS/Linux에서는 해당 OS target 지정 필요.

---

## Step 4 — 자동 업데이트(채널 운영): git pull 완전 제거

### Cursor 프롬프트

```
너는 내부용 Electron 자동 업데이트 운영을 설계/구현하는 엔지니어다.
목표: apps/desktop에 자동 업데이트를 붙여 테스터가 앱 실행만 하면 최신 버전을 받게 한다.
채널: Beta/Stable 최소 2개.

요구사항:
1) electron-updater 기반 업데이트 체크/다운로드/적용 흐름을 main 프로세스에 구성.
2) 업데이트 공급자는 단순한 것으로 시작:
   - GitHub Releases 또는
   - generic HTTPS(사내 파일 서버)
   중 하나를 선택하고 설정 스켈레톤 + TODO를 남긴다.
3) 개발 환경에서는 업데이트 체크 기본 OFF(ENV 플래그).
4) 업데이트 유예 정책(내부용):
   - 다운로드는 가능하면 백그라운드
   - 설치/재시작은 사용자가 선택하되 일정 시간 지나면 강제 가능(설계로 명시)

출력:
- UpdateFlow 상태 머신 요약
- Beta→Stable 승격 운영 룰(간단히)
- 릴리즈 체크리스트 10줄
```

### 완료 체크리스트 (Step 4)

- [ ] Beta 채널에서 새 버전을 감지/다운로드/설치 흐름이 동작한다
- [ ] 개발 환경에서는 업데이트가 자동으로 돌지 않는다
- [ ] 업데이트 실패 시 사용자에게 "진단 내보내기" 안내로 연결할 수 있다(버튼/메뉴/링크)

### Step 4 구현 참고 (현재 상태)

- **현재**: `apps/desktop/src/main/services/updater/index.ts`에서 `electron-updater`로 `checkForUpdatesAndNotify()`만 호출. 채널/공급자/개발 OFF/유예 정책/진단은 미구현.
- **프롬프트 적용 시 추가할 것**: (1) UpdateFlow 상태 머신 요약, (2) Beta/Stable 채널 및 공급자 설정(GitHub Releases 또는 generic URL) 스켈레톤, (3) NODE_ENV/ENV 플래그로 dev 시 체크 비활성화, (4) 다운로드 백그라운드 + 설치/재시작 선택·강제 유예 정책 설계, (5) 실패 시 "진단 내보내기" 버튼/메뉴/링크로 로그 또는 진단 파일 내보내기 연결.

---

## Step 5 — 진단(로그 내보내기) "반드시": 문제 재현/지원 표준화

### Cursor 프롬프트

```
너는 Electron 운영/관측성(Observability) 전문가다.
목표: 내부 테스트/운영을 위해 "진단 패키지(zip) 내보내기" 기능을 구현한다.

요구사항:
1) 최소 로깅:
   - main.log, renderer.log, updater.log 파일 생성/기록
2) 진단 내보내기:
   - meta.json (앱버전/채널/OS/아키텍처/빌드정보)
   - events.jsonl (APP_STARTED, UPDATE_*, JOB_* 최소 이벤트)
   - logs/*.log
   를 zip으로 묶어 내보낸다.
3) 민감정보 마스킹:
   - Authorization/쿠키/토큰은 절대 포함 금지
   - 경로에서 사용자명 등 마스킹
4) UI 접근성:
   - 메뉴/설정/에러 화면 어디서든 진입 가능
   - 실패해도 앱이 죽지 않음

출력:
- 진단 zip 내부 구조 트리
- 이슈 보고 템플릿(버전/채널/진단ID/재현절차)
- 운영자가 진단을 받았을 때 확인 순서(5단계)
```

### 완료 체크리스트 (Step 5)

- [ ] 앱에서 "진단 내보내기" 버튼을 눌러 zip 생성 가능
- [ ] zip에 main/renderer/updater 로그가 들어있다
- [ ] 토큰/쿠키 같은 민감정보가 포함되지 않는다
- [ ] 업데이트 실패/작업 실패 시 진단 내보내기로 유도 가능

---

## Step 6 — 의존성 최신화/경량화/최적화(마지막에 안전하게)

### Cursor 프롬프트

```
너는 Node.js/모노레포 의존성 최적화 전문가다.
목표: pnpm 기반 모노레포의 의존성을 최신화/정리/경량화하여 설치/빌드 속도와 안정성을 개선한다.
단, 기능을 깨는 대규모 마이그레이션은 금지하고 안전한 범위부터 진행한다.

요구사항:
1) 최신화 전략:
   - patch/minor 우선 적용
   - major는 영향 분석 후 TODO 계획만 작성
2) 버전 드리프트 방지:
   - workspace 공통 의존성 버전 정렬(예: pnpm overrides 또는 syncpack)
3) 불필요 의존성 제거:
   - knip 또는 depcheck 중 하나로 unused deps 탐지 후 정리
4) 배포 경량화:
   - Next.js는 가능한 경우 standalone output 고려(설계/권장)
   - Electron은 번들로 런타임 deps 최소화(가능 범위)
5) 캐시 전략:
   - pnpm store 캐시
   - turbo 캐시(가능하면 remote cache는 TODO)

출력:
- 실행 순서(커맨드 포함)
- 위험도(안전/주의/고위험) 체크리스트
- 개선 지표(설치시간/빌드시간/산출물 크기) 측정 방법
```

### 완료 체크리스트 (Step 6)

- [ ] pnpm install 속도가 개선되거나 일관성이 높아짐
- [ ] 중복/불필요 deps가 줄어듦
- [ ] 빌드 산출물 크기/시간을 측정하고 개선 전후 비교 가능
