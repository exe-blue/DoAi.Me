# Dev Container 재생성 전 호스트에서 실행하는 PowerShell 스크립트
# 사용: 프로젝트 루트에서 .\.devcontainer\rebuild-from-host.ps1

$ErrorActionPreference = "Stop"
$image = "mcr.microsoft.com/devcontainers/javascript-node:22"

Write-Host "Docker 확인 중..." -ForegroundColor Cyan
docker info 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker가 실행 중이 아니거나 설치되지 않았습니다. Docker Desktop을 실행한 뒤 다시 시도하세요." -ForegroundColor Red
    exit 1
}

Write-Host "Dev Container 이미지 pull: $image" -ForegroundColor Cyan
docker pull $image
if ($LASTEXITCODE -ne 0) {
    Write-Host "이미지 pull 실패." -ForegroundColor Red
    exit 1
}

Write-Host "준비 완료. Cursor에서 'Dev Containers: Rebuild and Reopen in Container' 를 실행하세요." -ForegroundColor Green
