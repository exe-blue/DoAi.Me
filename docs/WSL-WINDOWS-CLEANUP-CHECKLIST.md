# WSL → Windows 복귀 시 재발 방지 체크리스트

WSL/DevContainer에서 작업 후 Windows로 복귀할 때 PR에 섞이기 쉬운 부산물을 막고, EOL/설정을 안정화하기 위한 체크리스트.

## 1. PR에 넣지 말아야 할 것

- **로그/런타임 산출물**: `**/logs/**`, `**/farm_logs/**`, `*.log`
- **백업/임시**: `*.bak`, `*.backup`, `*_bak`, `agent/**/*.backup`
- **이상한 파일명**: `C:scriptscmd.json` 등 Windows 경로처럼 보이는 파일, 인코딩 깨진 파일명
- **DevContainer (Windows 전용 운영 시)**: `.devcontainer/**` — 팀 정책에 따라 제외
- **일회성 보고서**: `_cleanup_report.md`, `_status_report.md` (필요 시 별도 보관)

## 2. 레포 정책 (이미 반영된 것)

- **`.gitattributes`**: 소스코드 LF 고정 (`* text=auto eol=lf` 등)
- **`.gitignore`**: `C:scriptscmd.json`, `*scriptscmd.json`, `agent/logs/`, `.cursor/` 등

## 3. Windows에서 Git 권장 설정 (로컬만)

```bash
git config --global core.autocrlf true
git config --global core.filemode false
git config --global core.ignorecase true
```

## 4. PR 전 확인

- [ ] `git status` clean
- [ ] `git diff --name-only origin/main`에 로그/아카이브/`.bak`/이상한 파일명 없음
- [ ] `git log --oneline origin/main..HEAD`에서 chore/feat 구분 확인

## 5. 백업 후 정리

- rebase/대량 정리 전: `git switch -c backup/wsl-win-cleanup-YYYYMMDD`
- `git reset --hard` / 전체 `git clean -fd`는 사용하지 말 것

## 6. Windows에서만 실행할 Push 및 PR 확인

**아래 명령은 Windows( PowerShell 또는 Git Bash )에서만 실행한다.** WSL/DevContainer가 아닌, 실제 Windows 터미널에서 실행해야 GitHub 인증과 push가 동작한다.

### 6.1 레포 디렉터리로 이동

- **PowerShell 예시** (실제 본인 경로로 바꿀 것):

```powershell
cd C:\Users\choi\dev\DoAi.Me
```

- **Git Bash 예시**:

```bash
cd /c/Users/choi/dev/DoAi.Me
```

### 6.2 Push 명령 (한 번에 복사해 실행)

```bash
git fetch origin
git push --force-with-lease origin feat/cursor-changes
```

rebase를 이미 했다면 반드시 `--force-with-lease`로 push 한다.

### 6.3 PR 확인 (GitHub UI)

- **Conflict**: PR 페이지에 "This branch has no conflicts with the base branch" 표시되는지 확인.
- **Files changed**: 로그/아카이브/`.bak`/`C:scriptscmd.json`/`.devcontainer` 등 **제외했어야 할 항목이 포함되지 않았는지** 확인.
- **Commits 탭**: 커밋 순서와 메시지가 의도한 대로인지 확인 (chore → feat/fix → docs).

---

_이 문서는 WSL→Windows 정리 자동화 후 재발 방지를 위해 추가됨._
