# Deployment Pipeline Setup Guide

## Overview

This deployment pipeline provides a complete CI/CD setup for your Next.js application:

- **CI**: Linting, type checking, unit tests
- **Build**: Multi-stage Docker image build with caching
- **Security**: Trivy vulnerability scanning
- **Deployment**: Automated deployments to staging and production with health checks
- **Infrastructure**: Nginx reverse proxy with SSL/TLS, caching, rate limiting

## Release 1: DB 마이그레이션 (프로덕션/스테이징)

프로덕션 DB에 `task_devices`·`scripts`가 없으면 먼저 마이그레이션 적용이 필요합니다.

- **한 번에 적용**: [docs/RELEASE1_MIGRATION.md](docs/RELEASE1_MIGRATION.md) 참고
- **파일**: `supabase/migrations/20260227000000_release1_task_devices_scripts.sql`
- **적용 방법**: Supabase Dashboard SQL Editor에 붙여넣기 또는 `SUPABASE_DB_URL=... psql -f ...` / `./supabase/run_migrations.sh`

## Dev Container (로컬 개발용 컨테이너 다시 만들기)

Windows PowerShell에서 Docker로 이미지를 준비한 뒤, Cursor에서 Dev Container를 다시 띄우려면:

- **문서**: [.devcontainer/REBUILD.md](.devcontainer/REBUILD.md)
- **PowerShell 스크립트**: 프로젝트 루트에서 `.\.devcontainer\rebuild-from-host.ps1` 실행 후, Cursor에서 **Dev Containers: Rebuild and Reopen in Container** 실행

## Architecture

```
main branch → Production (docker-compose.prod.yml)
develop branch → Staging (docker-compose.staging.yml)

GitHub Actions Workflow:
1. Lint & Type Check (all pushes/PRs)
2. Unit Tests (all pushes/PRs)
3. Build & Push Image (on push to main/develop)
4. Security Scan (after image build)
5. Deploy to Staging (on develop push)
6. Deploy to Production (on main push)
```

## GitHub Secrets Configuration

Set these secrets in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

### Container Registry
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions

### Staging Deployment
- `STAGING_DEPLOY_KEY`: SSH private key for staging server
- `STAGING_DEPLOY_HOST`: Staging server hostname/IP
- `STAGING_DEPLOY_USER`: SSH user for staging server
- `STAGING_URL`: Base URL for staging health checks (e.g., https://staging.doai.me)

### Production Deployment
- `PROD_DEPLOY_KEY`: SSH private key for production server
- `PROD_DEPLOY_HOST`: Production server hostname/IP
- `PROD_DEPLOY_USER`: SSH user for production server
- `PROD_URL`: Base URL for production health checks (e.g., https://doai.me)

### Environment Secrets
Create `.env.staging` and `.env.prod` files on your servers, or set these as additional secrets:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `YOUTUBE_API_KEY`
- `SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`

## Local Setup

### 1. Generate SSH Keys for Deployment

```bash
# Generate deployment key (no passphrase for CI)
ssh-keygen -t ed25519 -f ~/.ssh/deploy_staging -C "CI deployment staging"
ssh-keygen -t ed25519 -f ~/.ssh/deploy_prod -C "CI deployment prod"

# Add public keys to target servers
ssh-copy-id -i ~/.ssh/deploy_staging.pub user@staging.server.com
ssh-copy-id -i ~/.ssh/deploy_prod.pub user@prod.server.com

# Copy private keys to GitHub Secrets
cat ~/.ssh/deploy_staging
cat ~/.ssh/deploy_prod
```

### 2. Server Setup

On your staging and production servers:

```bash
# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create app directory
sudo mkdir -p /app
sudo chown $USER:$USER /app

# Create .env files
cp .env.staging.example /app/.env.staging
cp .env.prod.example /app/.env.prod

# Add your actual secrets
nano /app/.env.staging
nano /app/.env.prod

# Configure SSL certificates (for production)
# Using Let's Encrypt with certbot:
sudo apt-get install certbot python3-certbot-nginx
sudo certbot certonly --standalone -d doai.me -d www.doai.me
```

### 3. GitHub Actions Setup

1. Push `.github/workflows/ci-cd.yml` to your repository
2. Set all required secrets in GitHub (see above)
3. Add environment protection rules:
   - Go to `Settings > Environments`
   - Create `staging` environment
   - Create `production` environment with required reviewers

### 4. Deployment Trigger

- **Staging**: Push to `develop` branch
- **Production**: Push to `main` branch

The workflow will:
1. Run linting and tests
2. Build Docker image
3. Push to GitHub Container Registry
4. Run security scan
5. Deploy to the appropriate environment
6. Run health checks

## Monitoring & Logs

### View Workflow Runs
```bash
# GitHub web UI: Actions tab
# or use GitHub CLI:
gh run list
gh run view <run-id>
```

### SSH into Servers and Check Logs
```bash
# Staging
ssh user@staging.server.com
docker-compose -f docker-compose.staging.yml logs -f app

# Production
ssh user@prod.server.com
docker-compose -f docker-compose.prod.yml logs -f app
```

### Check Container Status
```bash
ssh user@prod.server.com
docker ps
docker inspect doai-me-app-prod
docker stats doai-me-app-prod
```

## Scaling

### Horizontal Scaling with Docker Swarm

For multi-node production deployments:

```bash
# Initialize Swarm on primary node
docker swarm init

# Create service
docker service create --name doai-me \
  --replicas 3 \
  -p 3000:3000 \
  ghcr.io/exe-blue/doai-me:latest

# Update service
docker service update --image ghcr.io/exe-blue/doai-me:latest doai-me
```

### Kubernetes Option

For larger deployments, see `kubernetes/` directory for K8s manifests with:
- Deployment with replicas and resource limits
- Service for load balancing
- Ingress for routing
- ConfigMap for environment variables
- Secrets for sensitive data

## Rollback Procedure

If a deployment fails:

```bash
# SSH to production server
ssh user@prod.server.com

# Revert to previous image
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml down
docker run <previous-image-sha>
```

Or modify the workflow to pin an image SHA.

## Performance Optimization

The pipeline includes:

- **Layer caching**: Docker build uses GitHub Actions cache
- **Nginx caching**: 30-day cache for static assets
- **API caching**: 1-minute cache for non-auth endpoints
- **Gzip compression**: Enabled for all text content
- **HTTP/2**: Enabled for faster multiplexing
- **Connection pooling**: Upstream keepalive connections

## Security Features

- **Non-root container user**: Runs as `nextjs:nodejs`
- **Read-only filesystem**: Consider using `--read-only` in prod
- **Network isolation**: Services on dedicated bridge network
- **Security headers**: HSTS, CSP, X-Frame-Options
- **Rate limiting**: Per-IP rate limiting on all endpoints
- **SSL/TLS**: Enforced with automatic redirect
- **Vulnerability scanning**: Trivy scans all images

## Troubleshooting

### Deployment Fails at Health Check
```bash
# SSH to server and check app logs
docker-compose logs app

# Verify environment variables
docker exec doai-me-app-prod env | grep NEXT_PUBLIC

# Check port binding
docker port doai-me-app-prod
```

### Docker Image Build Fails
Check GitHub Actions logs for layer failures. Common issues:
- Package lock file outdated: `npm ci` should match lock file
- Missing environment variables during build: Use `--build-arg`

### Rate Limiting Too Aggressive
Adjust in nginx config files:
```nginx
limit_req_zone $binary_remote_addr zone=prod_limit:10m rate=50r/s;
limit_req zone=prod_limit burst=100 nodelay;
```

## Next Steps

1. Test the pipeline on `develop` branch
2. Verify staging deployment works
3. Create GitHub branch protection rules for `main`
4. Set up monitoring/alerting (e.g., Sentry, DataDog)
5. Document your specific deployment servers and IPs

Sources:
- https://docs.docker.com/build/ci/github-actions/
- https://docs.docker.com/compose/
- https://docs.docker.com/engine/swarm/
