# Windows NSIS 설치 및 검증 체크리스트

## 설치 요약

| 항목 | 값 |
|------|-----|
| **설치 경로** | `C:\Program Files (x86)\xiaowei\` |
| **실행 파일** | `xiaowei.exe` |
| **자동 실행** | Electron `app.setLoginItemSettings(openAtLogin: true)` (로그인 시 자동 실행) |
| **산출물** | `apps/desktop/release/` (NSIS 설치 파일) |

---

## 검증 체크리스트

### 1. 설치 후 exe 위치 확인

- **방법 1**: 설치 완료 후 탐색기에서 `C:\Program Files (x86)\xiaowei\` 열기 → `xiaowei.exe` 존재 여부 확인.
- **방법 2**: PowerShell 실행 후:
  ```powershell
  Test-Path "C:\Program Files (x86)\xiaowei\xiaowei.exe"
  ```
  `True` 이면 정상.

### 2. 재부팅/로그인 후 자동 실행 확인

1. 앱에서 **Launch at startup (로그인 시 자동 실행)** 를 **ON** 으로 설정 후 앱 종료.
2. Windows 로그아웃 후 다시 로그인(또는 재부팅 후 로그인).
3. 로그인 직후 작업 표시줄/실행 중인 앱에 **xiaowei**(DoAi Agent) 창이 자동으로 뜨는지 확인.

### 3. 자동 실행 해제 방법

- **권장**: 앱 실행 → 설정 화면에서 **Launch at startup** 체크 해제 (OFF).
- **레지스트리**:  
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 에서 값 이름 `xiaowei`(또는 `DoAi Agent`) 삭제.
- **작업 스케줄러**: Electron 로그인 항목은 Run 키를 사용하므로, 위 레지스트리에서 제거하면 됨. 별도 작업 스케줄러 항목은 사용하지 않음.

---

## 빌드 및 배포

- **로컬에서 설치 파일 생성** (Windows 필요):
  ```bash
  pnpm --filter @doai/client build
  pnpm --filter @doai/client dist
  ```
  또는:
  ```bash
  pnpm run desktop:dist
  ```
- **산출물**: `apps/desktop/release/*.exe` (NSIS 설치 파일).

- **GitHub Release 자동 빌드**:  
  태그 푸시 시 자동으로 빌드 후 GitHub Releases에 업로드됨.
  - 태그 예: `desktop-v1.0.0`, `desktop-beta-v1.0.0`
  - 워크플로우: `.github/workflows/desktop-release.yml`
