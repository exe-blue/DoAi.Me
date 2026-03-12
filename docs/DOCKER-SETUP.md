# Docker 및 SonarQube 설정 가이드

## 사전 요구사항

- Docker 및 Docker Compose v2
- (선택) SonarQube 스캔 시 [SonarScanner](https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/scanners/sonarscanner/) 또는 `npm install -g sonar-scanner`

---

## 1. 로컬 개발 (docker-compose)

### 1.1 환경 변수

`.env.local`이 없으면 앱이 기동 시 변수를 찾지 못할 수 있습니다. 최초 1회 설정:

```bash
cp .env.example .env.local
# .env.local에 Supabase/YouTube 등 실제 값 입력
```

### 1.2 실행

```bash
docker compose up --build
# 또는 백그라운드: docker compose up -d --build
```

- 앱: http://localhost:3000
- 헬스체크: http://localhost:3000/api/health

### 1.3 문제 해결

- **헬스체크 실패**: 앱이 올라올 때까지 30초 간격으로 재시도합니다. 로그는 `docker compose logs -f app`로 확인.
- **볼륨 마운트**: 소스 디렉터리(`src`, `app`, `components`, `lib`, `types`, `hooks` 등)가 핫리로드를 위해 마운트됩니다. `docker-compose.yml`의 `volumes` 섹션에서 정확한 목록을 확인하세요.

---

## 2. SonarQube (코드 품질 분석)

### 2.1 SonarQube 서버 기동

```bash
docker compose -f docker-compose.sonar.yml up -d
```

- 웹 UI: http://localhost:9000
- 기본 로그인: `admin` / `admin` (최초 접속 시 비밀번호 변경 필요)
- DB(PostgreSQL)가 준비된 뒤 SonarQube가 기동되므로, 첫 기동 시 1~2분 걸릴 수 있습니다.

### 2.2 프로젝트 스캔 (로컬 SonarQube)

```bash
# 프로젝트 루트(DoAi.Me)에서
sonar-scanner \
  -Dsonar.host.url=http://localhost:9000 \
  -Dsonar.token=YOUR_SONAR_TOKEN
```

토큰은 SonarQube 웹: **My Account → Security → Generate Token**에서 생성합니다.

### 2.3 SonarCloud (exe-blue) 사용 시

`.sonarlint/connectedMode.json`에 이미 SonarCloud 조직이 설정되어 있으면, SonarCloud용으로 스캔할 수 있습니다.

```bash
sonar-scanner \
  -Dsonar.organization=exe-blue \
  -Dsonar.host.url=https://sonarcloud.io \
  -Dsonar.token=YOUR_SONARCLOUD_TOKEN
```

`sonar-project.properties`의 `sonar.projectKey`는 SonarCloud에서 생성한 프로젝트 키와 맞추세요.

---

## 3. 스테이징/프로덕션 배포

스테이징/프로덕션 모두 **단일 `docker-compose.yml`**을 사용합니다.

CI/CD에서 빌드된 이미지는 `ghcr.io/${GITHUB_REPOSITORY}:${GITHUB_SHA}` 형태의 태그로 푸시되며,
각 환경 서버에서 아래 명령으로 배포합니다:

```bash
docker compose pull && docker compose up -d
```

모든 환경에서 앱 헬스체크는 `/api/health`를 사용하며, Node 런타임으로 확인합니다 (이미지 내 `wget` 불필요).

| 항목 | 내용 |
|------|------|
| Node 버전 | `node:22-alpine` (Dev Container·CI·개발 환경과 동일) |
| 헬스체크 | `node -e "require('http').get(...)"` → `/api/health` |
| 이미지 태그 | `ghcr.io/${GITHUB_REPOSITORY}:${GITHUB_SHA}` |
