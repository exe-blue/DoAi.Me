# Desktop Windows exe 빌드 실패 원인 분석

**날짜**: 2026-03-02  
**대상**: GitHub Actions `.github/workflows/release-desktop.yml`, Windows exe 빌드  
**역할**: 실패 원인 분석, 검증 방법, 수정 권장사항

---

## 1. 실패 원인 분석 (근본 원인)

### 1.1 Install dependencies 단계 실패

가능한 근본 원인:

| 원인 | 설명 | 가능성 |
|------|------|--------|
| **Lockfile 불일치** | `pnpm install`(비고정)으로 전환 전에는 `--frozen-lockfile` 사용 시 `package.json`과 `pnpm-lock.yaml` 불일치로 exit 1 발생 가능. 전환 후에는 해소되었을 수 있음. | 중 |
| **pnpm 캐시 오염** | `cache: "pnpm"`으로 이전 실패 시점의 store가 복원되면, lockfile/버전 불일치로 설치 실패 가능. | 중 |
| **Windows 경로/권한** | Windows runner의 긴 경로, OneDrive/매핑, 또는 스크립트 실행 정책 이슈. (현재 postinstall 등 라이프사이클 스크립트 없음) | 낮음 |
| **packageManager 일치** | 루트 `package.json`의 `"packageManager": "pnpm@10.29.3"`과 워크플로 `version: 10.29.3` 일치함 — 이 부분은 정상. | — |

코드·워크스페이스·lockfile 관점:

- **워크스페이스**: `pnpm-workspace.yaml`은 `apps/*`, `packages/*`만 포함. `apps/desktop`은 다른 워크스페이스 패키지에 의존하지 않음.
- **Lockfile**: `pnpm-lock.yaml`에 `apps/desktop`이 포함되어 있고 `lockfileVersion: '9.0'`(pnpm 9+ 호환). 루트와 desktop 간 의존성 불일치 자체는 없어 보임.
- **스크립트**: 루트·desktop 모두 postinstall/install 스크립트 없음 — 설치만으로는 스크립트 실패 가능성 낮음.

### 1.2 Build desktop 단계 실패

`pnpm --filter @doai/desktop run dist`는 다음을 순서대로 실행함:

```json
"dist": "pnpm run test && pnpm run build && node scripts/download-node-win.js && electron-builder --win"
```

| 단계 | 내용 | 실패 가능 원인 |
|------|------|----------------|
| **test** | `node src/agent/scripts/smoke-require-agent.js` | agent 모듈 9개 require. `config.js`가 `.env` 로드(파일 없어도 경고만). CI에서 env 미설정 시 일부 모듈이 런타임에 throw할 수 있음. |
| **build** | `tsc -p tsconfig.electron.json && vite build` | Turbo가 이미 `build`를 의존으로 실행하므로 사실상 두 번 실행. Windows 경로/대소문자, 디스크 공간. |
| **download-node-win.js** | Node 20.18.0 win-x64 zip 다운로드 후 `node-bundle/`에 node.exe 추출 | 네트워크 차단, `adm-zip` 동작 이슈, 또는 Windows 경로. |
| **electron-builder --win** | NSIS 설치본 생성 | 경로 길이, AV, 리소스 경로(`extraResources`: `src/agent`, `node-bundle`), `build/installer.nsh` 존재함. |

Turbo와의 관계:

- `turbo.json`에서 `dist`는 `dependsOn: ["build"]`이므로, Turbo가 먼저 `build`(및 `typecheck`)를 실행한 뒤 `dist` 스크립트를 실행함.
- 따라서 실제 순서: **typecheck → build(tsc+vite) → dist(test → build → download-node → electron-builder)**. build가 두 번 돌아도 실패 원인으로 보기보다는, **test** 또는 **download-node** / **electron-builder** 중 한 단계에서 실패할 가능성이 큼.

---

## 2. 가능한 원인 후보 요약

- **(a) pnpm workspace/root와 apps/desktop 의존성 불일치**  
  - **결론**: desktop은 워크스페이스 내 다른 패키지에 의존하지 않음. lockfile에도 desktop이 정상 등록되어 있어 여기서 오는 실패 가능성은 낮음.

- **(b) lockfile과 package.json 불일치로 인한 설치 실패**  
  - **결론**: 과거 `--frozen-lockfile` 사용 시 가능했음. `pnpm install`로 바꾼 뒤에는 해소되었을 수 있으나, 캐시가 꼬이면 동일 현상 재발 가능. 로그가 없어 단정 어려움.

- **(c) Windows 환경에서만 발생하는 경로/스크립트 이슈**  
  - **결론**: 가능. 경로 길이, `path.join`/백슬래시, 또는 PowerShell/Node 동작 차이. 특히 `download-node-win.js`의 `entry.entryName.replace(..., " ").replace(/^[^/]+[/\\]/, "")` 등 경로 처리에서 Windows 호환성 확인 필요.

- **(d) desktop dist 스크립트 내 test / build / download-node / electron-builder 중 한 단계 실패**  
  - **결론**: 가장 유력. CI 로그에 “어느 단계에서 exit 1”인지가 없어, test(agent require 실패) 또는 download-node(네트워크/추출 실패), electron-builder(패키징 실패) 중 하나로 좁혀야 함.

- **(e) 기타**  
  - pnpm store 캐시 복원 실패, Node 20 + pnpm 10.29.3 조합 이슈, 또는 runner 리소스 부족 등.

---

## 3. 검증 방법 제안

### 3.1 로컬 재현 (Linux/WSL)

```bash
# 루트에서
pnpm install
pnpm --filter @doai/desktop run dist
```

- 실패 시: 터미널에서 **어느 단계(test/build/download-node/electron-builder)**에서 끊기는지 확인.
- 참고: WSL에서는 `electron-builder --win`으로 Windows용 exe 생성 가능. 로컬이 Windows가 아니면 “Verify installer artifact” 단계까지는 CI와 동일하게 검증할 수 없음.

### 3.2 로컬 재현 (Windows)

- 동일한 명령을 Windows(또는 GitHub Actions와 유사한 PowerShell 환경)에서 실행해, (c) 항목 재현 여부 확인.

### 3.3 CI 로그에서 확인할 항목

1. **Install dependencies**
   - `pnpm install`의 stderr/stdout 전체. exit code 1일 때 상세 에러 메시지.
   - 필요 시: `pnpm install 2>&1 | Out-String` 등으로 로그 남기기.

2. **Build desktop**
   - `dist` 스크립트가 test / build / download-node / electron-builder 중 **어디에서** 실패하는지:
     - `[smoke] OK ...` / `[smoke] FAIL ...` 여부.
     - `Downloading https://nodejs.org/dist/...` 이후 에러 여부.
     - `electron-builder` 단계의 에러/경고 메시지.

3. **캐시**
   - 한 번은 `cache: "pnpm"`을 제거하고 실행해, 캐시 복원에 따른 실패 여부 비교.

---

## 4. 결론 및 권장 변경 사항

### 4.1 결론 (1–2문장)

- **설치 실패**: lockfile 고정 모드와의 불일치 또는 pnpm 캐시 복원으로 인한 설치 실패 가능성이 있고, 상세 로그가 없어 정확한 원인 단정은 어렵다.
- **빌드 실패**: `dist` 파이프라인 중 **test(agent smoke)** 또는 **download-node-win.js**, **electron-builder** 중 한 단계가 Windows CI에서 실패했을 가능성이 크며, 실패 지점을 로그로 확인하는 것이 우선이다.

### 4.2 권장 변경 사항

| 대상 | 권장 변경 |
|------|-----------|
| **워크플로 (로그)** | Install: 실패 시 로그 확보를 위해 `run: pnpm install` 유지하되, 다음 실행에서 실패하면 Actions 탭에서 "Install dependencies" 단계 로그 전체 확인. Build desktop: 실패 지점 파악을 위해 dist를 단계별로 쪼개기 — 예: `pnpm --filter @doai/desktop run test`, `pnpm --filter @doai/desktop run build`, `node apps/desktop/scripts/download-node-win.js`(cwd: apps/desktop), `pnpm --filter @doai/desktop exec electron-builder --win` — 각각 별도 step으로 두면 어느 단계에서 exit 1인지 명확히 보임. |
| **워크플로 (캐시)** | 재현 시 캐시 제거: `cache: "pnpm"`을 일시 제거하고 한 번 실행해, 캐시로 인한 설치 실패 여부 확인. |
| **워크플로 (lockfile)** | 안정화 후 재도입: 문제 원인 제거 후 `pnpm install --frozen-lockfile`로 되돌려 재현성 확보. |
| **package.json (desktop)** | dist 단계 분리(선택): CI 전용 스크립트 예: `"dist:ci": "pnpm run build && node scripts/download-node-win.js && electron-builder --win"`처럼 test를 제외하고, test는 별도 job에서만 실행. (smoke가 CI에서 불필요하다고 판단될 때만.) |
| **스크립트** | `scripts/download-node-win.js`: 실패 시 `console.error`로 URL/상태코드/에러 메시지를 명확히 출력해 CI 로그에서 원인 파악 가능하게 함. |
| **문서** | 이 보고서 경로: `docs/qa-reports/2026-03-02-desktop-exe-build-failure-analysis.md`. CI 재실행 후 실패 로그를 이 문서에 요약해 두면 이후 원인 추적에 유리함. |

---

## 5. 참고: 분석에 사용한 파일

| 파일 | 용도 |
|------|------|
| `.github/workflows/release-desktop.yml` | 트리거, pnpm 버전, Install/Build 단계 |
| `apps/desktop/package.json` | scripts.dist, 의존성, build 설정 |
| `package.json` (루트) | packageManager, scripts |
| `pnpm-workspace.yaml` | 워크스페이스 목록 |
| `pnpm-lock.yaml` | lockfile 버전 및 apps/desktop 의존성 |
| `turbo.json` | dist dependsOn build, build dependsOn typecheck |
| `apps/desktop/scripts/download-node-win.js` | Node 다운로드 및 node-bundle 생성 |
| `apps/desktop/src/agent/scripts/smoke-require-agent.js` | dist 시 실행되는 test 단계 |
