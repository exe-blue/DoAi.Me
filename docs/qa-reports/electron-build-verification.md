# Electron Build Verification

**Date**: 2026-03-02
**Build host**: WSL2 (Linux 6.6.87.2-microsoft-standard)
**electron-builder**: 25.1.8
**Electron runtime**: 33.4.11

---

## 1. 빌드 명령 확인

| 스크립트 | 명령 | 패키징 여부 |
| --------- | ------ | ------------ |
| `pnpm run build` | `tsc -p tsconfig.electron.json && vite build` | ❌ 컴파일만 (패키징 없음) |
| `pnpm run dist` | `pnpm run build && electron-builder --win` | ✅ NSIS 설치 파일 생성 |
| **이번 실행** | `electron-builder --dir --win --x64 --config.win.signAndEditExecutable=false` | ✅ 언패키드 디렉토리 생성 |

`pnpm run build`는 TypeScript → CommonJS 변환 + Vite renderer 번들링만 수행하며, 실행 파일을 생성하지 않음. Electron 패키징은 `electron-builder`를 별도 실행해야 함.

---

## 2. 산출물 목록

| 경로 | 크기 | 설명 |
|------|------|------|
| `release/win-unpacked/doai-me.exe` | **181 MB** | Electron 메인 실행 파일 |
| `release/win-unpacked/` (전체) | **327 MB** | 언패키드 앱 디렉토리 (DLL, resources 포함) |
| `release/Xiaowei Setup 1.0.0.exe` | 284 KB | 이전 빌드 NSIS 설치 파일 (구 productName) |
| `release/builder-debug.yml` | — | electron-builder 디버그 매니페스트 |

> `Xiaowei Setup 1.0.0.exe`는 이전 빌드 산출물로 삭제 대상임.

---

## 3. package.json 필드 대조 (`apps/desktop/package.json`)

| 필드 | 현재 값 | 3번 AI 결과 | 일치 여부 |
|------|---------|------------|---------|
| `build.productName` | `doai.me` | `doai.me` | ✅ 일치 |
| `build.appId` | `me.doai.desktop` | `me.doai.desktop` | ✅ 일치 |
| `build.win.executableName` | `doai-me` | `doai-me` | ✅ 일치 |
| `main` | `dist-electron/main/main.js` | — | ✅ 표준 Electron 엔트리 |

모든 필드가 기준값과 일치함. 불일치 없음.

---

## 4. 서명 상태

| 항목 | 상태 |
|------|------|
| 코드 서명 | ❌ 미서명 (`signAndEditExecutable=false` 명시적 비활성화) |
| 빌드 환경 | WSL2 Linux (Windows 코드 서명 불가) |
| 프로덕션 배포 시 | Windows 환경에서 인증서로 서명 필요 |

---

## 5. 빌드 경고

| 경고 | 내용 |
|------|------|
| `description is missed` | `package.json`에 `description` 필드 없음 |
| `author is missed` | `package.json`에 `author` 필드 없음 |
| `npmRebuild is set to false` | native 모듈 재빌드 건너뜀 (의도적 설정) |

---

## 결론

- `pnpm run build`는 패키징이 아닌 컴파일 단계임 — 확인됨
- `electron-builder --dir --win --x64`로 181 MB `doai-me.exe` 생성 성공
- `package.json` 빌드 필드 3종 모두 기준값 일치
- 코드 서명 없음 — 내부 배포 환경에서는 허용 가능, 퍼블릭 배포 시 서명 필요
