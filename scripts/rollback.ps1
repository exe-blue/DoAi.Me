# rollback.ps1 — 긴급 롤백 (3줄 핵심)
# 사용법: .\scripts\rollback.ps1 v0.1.0

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ROOT

$current = git describe --tags --always 2>$null
Write-Host "롤백: $current → $Version" -ForegroundColor Yellow

# 핵심 3줄
git fetch origin
git checkout $Version
Set-Location agent; npm ci --silent 2>$null; Set-Location $ROOT

Write-Host "✓ 롤백 완료: $Version" -ForegroundColor Green
Write-Host "시작: node agent\agent.js" -ForegroundColor Green
