# 배포 절차 (로컬에서 실행)

현재 브랜치 `deploy/align-schema-docs-20260228`에 커밋까지 완료된 상태입니다. 아래를 **로컬 터미널**에서 순서대로 실행하세요.

## 1. 푸시

```bash
git push -u origin deploy/align-schema-docs-20260228
```

(SSH 대신 HTTPS를 쓰는 경우: `git remote set-url origin https://github.com/exe-blue/DoAi.Me.git` 후 위 push)

## 2. PR 생성 및 머지

**GitHub CLI 사용 시:**

```bash
gh pr create --base main --head deploy/align-schema-docs-20260228 --title "Deploy: schema alignment, handoff docs, agent serial_number/last_heartbeat" --body "Schema alignment (devices serial_number/last_heartbeat), deployment-database-manager handoff doc, verify_schema_handoff.sql, align_devices_handoff migration, agent & doc updates."
gh pr merge --merge
```

**웹에서 할 때:**

1. https://github.com/exe-blue/DoAi.Me/compare/main...deploy/align-schema-docs-20260228
2. "Create pull request" → 제목/본문 입력 후 Create
3. PR 페이지에서 "Merge pull request" → Confirm merge

## 3. Vercel 배포

- **main**에 머지되면 Vercel이 자동으로 프로덕션 배포를 시작하는 경우가 많습니다.
- 수동 배포가 필요하면:

```bash
# Vercel CLI 설치 후 (npm i -g vercel)
vercel --prod
```

또는 Vercel 대시보드 → 프로젝트 → Deployments → 최신 main 배포 확인/재배포.

## 4. (선택) main 동기화

머지 후 로컬 main을 최신으로 맞추려면:

```bash
git checkout main
git pull origin main
git branch -d deploy/align-schema-docs-20260228
```
