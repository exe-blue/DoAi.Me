# GitHub Secrets 설정 가이드

## 필수 설정 단계

GitHub Actions CI/CD 파이프라인을 완전히 작동시키려면 아래의 시크릿과 환경 변수를 설정해야 합니다.

### 1단계: GitHub 저장소 설정 접근

1. https://github.com/exe-blue/DoAi.Me 접속
2. `Settings` → `Secrets and variables` → `Actions` 클릭

### 2단계: 시크릿 추가 (꼭 필요한 것)

#### 2-1. 애플리케이션 환경 변수

아래 시크릿들을 추가합니다. 각 이름을 정확히 입력해야 합니다:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
YOUTUBE_API_KEY
SENTRY_DSN (선택)
SENTRY_AUTH_TOKEN (선택)
```

**설정 방법:**
- Name 필드에: `NEXT_PUBLIC_SUPABASE_URL`
- Secret 필드에: 실제 값 입력 (예: `https://your-project.supabase.co`)
- "Add secret" 클릭

#### 2-2. 스테이징 배포 (Staging 환경)

만약 staging 서버가 있다면 다음을 추가합니다:

```
STAGING_DEPLOY_HOST        → staging.example.com
STAGING_DEPLOY_USER        → deploy-user
STAGING_DEPLOY_KEY         → SSH 개인키 (아래 참고)
STAGING_URL                → https://staging.example.com
```

#### 2-3. 프로덕션 배포 (Production 환경)

프로덕션 배포가 필요하면 추가합니다:

```
PROD_DEPLOY_HOST           → prod.example.com
PROD_DEPLOY_USER           → deploy-user
PROD_DEPLOY_KEY            → SSH 개인키 (아래 참고)
PROD_URL                   → https://doai.me
```

### 3단계: SSH 키 생성 (배포용)

만약 실제 서버에 자동 배포를 설정하려면, SSH 키를 생성하세요:

#### Windows PowerShell에서:
```powershell
# SSH 키 디렉토리 생성
mkdir $env:USERPROFILE\.ssh -ErrorAction SilentlyContinue

# ED25519 키 생성 (보안성 높음)
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\deploy_staging -C "CI deployment staging"
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\deploy_prod -C "CI deployment production"

# 공개 키를 서버에 복사 (각 서버에서 실행)
# staging 서버:
type $env:USERPROFILE\.ssh\deploy_staging.pub | ssh deploy-user@staging.example.com "cat >> ~/.ssh/authorized_keys"

# production 서버:
type $env:USERPROFILE\.ssh\deploy_prod.pub | ssh deploy-user@prod.example.com "cat >> ~/.ssh/authorized_keys"

# 개인 키 출력 (GitHub Secret에 복사할 내용)
Get-Content $env:USERPROFILE\.ssh\deploy_staging
Get-Content $env:USERPROFILE\.ssh\deploy_prod
```

#### Linux/Mac에서:
```bash
# SSH 키 생성
ssh-keygen -t ed25519 -f ~/.ssh/deploy_staging -C "CI deployment staging"
ssh-keygen -t ed25519 -f ~/.ssh/deploy_prod -C "CI deployment production"

# 공개 키를 서버에 복사
ssh-copy-id -i ~/.ssh/deploy_staging.pub deploy-user@staging.example.com
ssh-copy-id -i ~/.ssh/deploy_prod.pub deploy-user@prod.example.com

# 개인 키 출력
cat ~/.ssh/deploy_staging
cat ~/.ssh/deploy_prod
```

### 4단계: 환경(Environments) 설정

GitHub의 환경 보호 규칙을 설정하면 프로덕션 배포 시 승인이 필요합니다:

1. Repository `Settings` → `Environments`
2. `New environment` 클릭
3. "staging" 생성
4. "production" 생성 후 `Required reviewers` 체크 (승인자 지정)

### 5단계: 배포 브랜치 보호 규칙

메인 브랜치를 보호해서 안정성을 높입니다:

1. `Settings` → `Branches` → `Add rule`
2. Branch name pattern: `main`
3. 다음 체크:
   - ✓ Require a pull request before merging
   - ✓ Require status checks to pass before merging
   - ✓ Require branches to be up to date before merging
   - ✓ Include administrators

### 6단계: 워크플로우 테스트

간단한 커밋을 `develop` 브랜치에 푸시해서 파이프라인이 작동하는지 테스트합니다:

```bash
git checkout develop
echo "# Test" >> README.md
git add README.md
git commit -m "Test CI/CD pipeline"
git push origin develop
```

GitHub Actions 탭에서 워크플로우 실행을 모니터링합니다:
https://github.com/exe-blue/DoAi.Me/actions

## 로컬 서버 배포 없이 테스트하기

배포 서버가 아직 없다면, 로컬에서 다음과 같이 테스트할 수 있습니다:

```bash
# 로컬에서 Docker 이미지 빌드 및 실행
docker build -t doai-me:latest .

# Staging 설정으로 실행
docker-compose -f docker-compose.staging.yml up -d

# 또는 Production 설정으로 실행
docker-compose -f docker-compose.prod.yml up -d

# 상태 확인
docker ps
docker logs doai-me-app-staging
```

## 문제 해결

### GitHub Actions 워크플로우가 실행되지 않음

1. `.github/workflows/ci-cd.yml` 파일이 저장소에 있는지 확인
2. `main` 또는 `develop` 브랜치에 푸시했는지 확인
3. GitHub Actions가 활성화되어 있는지 확인:
   - Settings → Actions → General → "Allow all actions and reusable workflows"

### 빌드 실패

보통 다음 중 하나입니다:

1. **환경 변수 누락**: 모든 필수 시크릿이 설정되었는지 확인
2. **의존성 설치 실패**: `npm ci` 실패 시 `package-lock.json` 확인
3. **Docker 빌드 실패**: 로컬에서 `docker build` 테스트해보기

### 배포 실패

1. **SSH 키 오류**: 공개 키가 서버의 `~/.ssh/authorized_keys`에 있는지 확인
2. **권한 부족**: 배포 사용자가 `/app` 디렉토리에 쓰기 권한이 있는지 확인
3. **건강 검사 실패**: 서버의 포트 3000이 열려있는지 확인

```bash
# 서버에서 포트 확인
netstat -an | grep 3000
# 또는
ss -an | grep 3000

# 컨테이너 로그 확인
docker-compose logs app
```

## 다음 단계

1. **모니터링**: Sentry (에러 추적) 또는 Datadog (성능 모니터링) 설정
2. **로깅**: ELK Stack 또는 CloudWatch 설정
3. **자동 스케일링**: Kubernetes 사용 시 HPA 설정
4. **백업**: 정기적인 데이터베이스 백업 자동화

---

모든 설정이 완료되면, `develop` 또는 `main` 브랜치로 푸시할 때마다 자동으로:
✓ 코드 검사 (린트)
✓ 테스트 실행
✓ Docker 이미지 빌드 및 레지스트리 푸시
✓ 보안 스캔
✓ 자동 배포 (staging/production)
✓ 건강 검사

이 모든 작업이 GitHub Actions에서 자동으로 실행됩니다!
