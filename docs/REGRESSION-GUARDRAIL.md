# Regression Guardrail (회귀: 단 하나의 강제 규칙)

## 목적

WSL ↔ Windows ↔ Dev Container 혼용으로 발생했던 “대량 변경 / 반영 착시 / 롤백처럼 보임 / PR 오염”을 재발시키지 않기 위한 최소 안전장치.

## 회귀 (반드시 지켜야 하는 1가지)

**이 레포는 Dev Container(Linux) 단일 기준으로만 개발·실행한다.**

### 금지

- 동일 브랜치를 Windows/WSL/Dev Container에서 번갈아 열거나 실행하는 행위
- Windows에서 `npm install / build / test` 실행 (예외 없음)
- WSL 파일시스템(\\wsl$)과 Windows 파일시스템(C:\...)을 섞어서 같은 레포를 편집

### 강제 체크(작업 시작 시 30초)

Dev Container 터미널에서 아래 3개가 모두 맞아야 작업을 시작한다.

1. Linux 컨테이너인가?

- `uname -a`
- `cat /etc/os-release | head`

2. 레포 루트가 컨테이너 작업공간인가?

- `pwd` 가 `/workspaces/...`
- `git rev-parse --show-toplevel`

3. main에서 작업 중이 아닌가?

- `git branch --show-current` 가 `main`이면 즉시 `feat/*` 또는 `fix/*` 브랜치 생성

## 예외(필요 시)

Windows 전용 작업(드라이버/ADB/USB 등)이 불가피할 때는 “작업은 Windows, 빌드/테스트는 Dev Container”로만 허용한다.
예외를 썼다면 아래를 반드시 기록한다.

- 무엇을 Windows에서 했는지
- 왜 Dev Container에서 못 했는지
- 재현 방법과 영향 범위

기록 위치(권장): `docs/DEV-ENV-EXCEPTIONS.md`

## 위반 시 조치(강제)

혼용이 의심되면 즉시 중단하고 아래를 수행한다.

- `git status --porcelain` 로 오염 범위 확인
- 로그/백업/아카이브/깨진 파일명 등이 섞였으면 PR에서 제거 후 재정렬
- 필요하면 clean 브랜치로 체리픽(정책 PR / 기능 PR 분리)

---

### TL;DR

**Dev Container에서만 작업한다. 섞지 않는다.**
