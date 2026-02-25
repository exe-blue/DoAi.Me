# deploy.ps1 — PC Agent 배포 스크립트
# 사용법: .\scripts\deploy.ps1 [버전태그]
# 예: .\scripts\deploy.ps1 v0.2.0

param(
    [string]$Version = "",
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ROOT

Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  DoAi.Me Agent Deploy" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan

# 1. 현재 버전 기록
$currentCommit = git rev-parse --short HEAD
$currentTag = git describe --tags --always 2>$null
Write-Host "[1] 현재: $currentTag ($currentCommit)"

# 2. Pull
Write-Host "[2] git pull..."
git fetch origin
if ($Version) {
    Write-Host "    버전 지정: $Version"
    git checkout $Version
} else {
    git pull origin main
}
$newCommit = git rev-parse --short HEAD
Write-Host "    업데이트: $newCommit"

# 3. 의존성
Write-Host "[3] npm ci..."
npm ci --silent 2>$null
Set-Location agent
npm ci --silent 2>$null
Set-Location $ROOT

# 4. 설정 검증
Write-Host "[4] 설정 검증..."
$envFile = "agent\.env"
if (-not (Test-Path $envFile)) {
    Write-Host "    ✗ agent\.env 파일 없음!" -ForegroundColor Red
    exit 1
}
$pcNumber = (Get-Content $envFile | Select-String "PC_NUMBER=(.+)").Matches.Groups[1].Value
Write-Host "    PC_NUMBER: $pcNumber"

# 5. Node.js 버전 확인
$nodeVer = node --version
Write-Host "[5] Node.js: $nodeVer"
if (-not $nodeVer.StartsWith("v22")) {
    Write-Host "    ⚠ Node.js 22.x 권장" -ForegroundColor Yellow
}

# 6. PM2 (optional)
$pm2Installed = $null -ne (Get-Command pm2 -ErrorAction SilentlyContinue)
if ($pm2Installed) {
    Write-Host "[6] PM2 확인됨"
    pm2 restart agent 2>$null
    if ($LASTEXITCODE -ne 0) {
        pm2 start agent/ecosystem.config.js
    }
    Write-Host "    Windows 부팅 시 자동 시작: pm2-startup install && pm2 save (관리자 권한)"
} else {
    Write-Host "[6] PM2 미설치 — 수동 실행: node agent\agent.js" -ForegroundColor Yellow
    Write-Host "    설치: npm install -g pm2 pm2-windows-startup"
}

# 7. Smoke test (optional, requires agent running and Supabase env)
Write-Host "[7] Smoke test..."
$smokeExit = 0
try {
    & node scripts/smoke-test.js 2>&1 | ForEach-Object { Write-Host "    $_" }
    $smokeExit = $LASTEXITCODE
} catch {
    Write-Host "    ⚠ Smoke test 스킵 또는 실패 (Agent 실행 후 재실행 권장)" -ForegroundColor Yellow
}

# 8. 완료
Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host "  배포 완료: $currentTag → $newCommit" -ForegroundColor Green
if ($pm2Installed) {
    Write-Host "  PM2: pm2 status / pm2 logs" -ForegroundColor Green
} else {
    Write-Host "  시작: node agent\agent.js" -ForegroundColor Green
}
if ($smokeExit -eq 0) {
    Write-Host "  Smoke test: PASS" -ForegroundColor Green
} else {
    Write-Host "  Smoke test: FAIL (Agent 기동 후 node scripts\smoke-test.js 재실행)" -ForegroundColor Yellow
}
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
