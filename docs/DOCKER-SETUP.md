# Docker 및 SonarQube 설정 가이드

이 문서는 **로컬 SonarQube** 실행과 스캔 방법만 다룹니다. 대시보드/Agent용 애플리케이션 컨테이너는 제공하지 않으므로, 앱은 기존 절차대로 `pnpm run dev`(apps/web) 또는 `npm run build && npm start`(agent)로 실행하세요.

## 1. 사전 요구사항

- Docker + Docker Compose v2
- (선택) [SonarScanner](https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/scanners/sonarscanner/) CLI  
  `npm install -g sonar-scanner` 또는 바이너리 설치
- SonarCloud 기본 설정은 `.sonarlint/connectedMode.json`에 정의됨 (`organization`: exe-blue, `projectKey`: exe-blue_DoAi.Me)

## 2. 로컬 SonarQube 기동

루트에 있는 `docker-compose.sonar.yml`을 사용합니다.

```bash
docker compose -f docker-compose.sonar.yml up -d
# 중지: docker compose -f docker-compose.sonar.yml down
# 볼륨 포함 완전 종료: docker compose -f docker-compose.sonar.yml down -v
```

- UI: http://localhost:9000
- 기본 계정: `admin` / `admin` (최초 로그인 시 비밀번호 변경 필요)
- 첫 기동 시 DB 초기화 때문에 1~2분 정도 소요될 수 있습니다.

## 3. 코드 스캔 실행

프로젝트 루트에서 `sonar-scanner`를 실행합니다. 토큰은 SonarQube/SonarCloud 웹 UI에서 생성합니다.

### 3.1 SonarCloud (기본)

```bash
sonar-scanner \
  -Dsonar.host.url=https://sonarcloud.io \
  -Dsonar.organization=exe-blue \
  -Dsonar.projectKey=exe-blue_DoAi.Me \
  -Dsonar.token=YOUR_SONARCLOUD_TOKEN
```

필요 시 `sonar.sources`(예: `apps/web/src,apps/web/app,packages,agent/src`)를 추가해 스캔 범위를 지정할 수 있습니다.

### 3.2 로컬 SonarQube (docker-compose.sonar.yml)

```bash
sonar-scanner \
  -Dsonar.host.url=http://localhost:9000 \
  -Dsonar.projectKey=doai-me-local \
  -Dsonar.login=YOUR_LOCAL_TOKEN
```

`YOUR_LOCAL_TOKEN`은 SonarQube UI의 **My Account → Security → Generate Tokens**에서 생성합니다. 로컬 인스턴스에서만 사용할 별도 projectKey를 만들어도 됩니다.
