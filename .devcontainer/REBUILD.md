# Dev Container 다시 생성/설치

호스트(Windows)에서 Docker + PowerShell로 준비한 뒤, Cursor에서 컨테이너를 다시 띄우는 절차입니다.

## 1. 호스트 PowerShell에서 (Docker 준비)

프로젝트 루트에서 PowerShell을 열고 아래를 순서대로 실행하세요.

```powershell
# Docker Desktop이 실행 중인지 확인
docker info

# Dev Container용 이미지 미리 받기 (Cursor Rebuild 시 더 빨라짐)
docker pull mcr.microsoft.com/devcontainers/javascript-node:22

# (선택) 기존 DoAi.Me 관련 컨테이너 정리 후 재시작하고 싶을 때
# docker ps -a --filter "name=doai" -q | ForEach-Object { docker rm -f $_ }
```

## 2. Cursor에서 컨테이너 생성/설치

1. **Cursor** 실행 후 이 프로젝트 폴더 열기.
2. **명령 팔레트** 열기: `Ctrl+Shift+P` (Windows) / `Cmd+Shift+P` (Mac).
3. 다음 중 하나 실행:
   - **`Dev Containers: Rebuild and Reopen in Container`**  
     → 이미지 다시 빌드(필요 시) 후 컨테이너 생성·설치 후 재진입.
   - 또는 **`Dev Containers: Reopen in Container`**  
     → 기존 설정으로 컨테이너만 다시 열기.

이 단계에서 Cursor가 `.devcontainer/devcontainer.json`을 읽고,  
`mcr.microsoft.com/devcontainers/javascript-node:22` 이미지로 컨테이너를 만들고,  
워크스페이스를 마운트한 뒤 컨테이너 안으로 들어갑니다.

## 3. 컨테이너 안에서 할 일

컨테이너가 뜬 뒤에는 **개발 작업만** 하면 됩니다.

- Node / npm: 이미 설치됨
- 의존성: `npm install`
- 빌드: `npm run build`
- 테스트: `npm test`
- Supabase CLI: `npx supabase` (전역 설치 불필요)
- Vercel: `npx vercel` 또는 배포 설정에 따라 사용

컨테이너 생성·이미지 pull·확장 설치 등은 Cursor가 처리합니다.
