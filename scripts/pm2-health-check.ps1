# pm2-health-check.ps1
# Polls agent health endpoint (http://127.0.0.1:9100/). If unhealthy for >2 min, runs pm2 restart agent.
# Run via Task Scheduler every 1-2 min, or in a loop: while ($true) { .\scripts\pm2-health-check.ps1; Start-Sleep -Seconds 60 }

param(
    [int] $Port = 9100,
    [int] $UnhealthyThresholdSec = 120
)

$ErrorActionPreference = "Stop"
$healthUrl = "http://127.0.0.1:$Port/health"
$stateFile = Join-Path $env:TEMP "doai-agent-health-state.json"

function Get-HealthState {
    if (Test-Path $stateFile) {
        $json = Get-Content $stateFile -Raw | ConvertFrom-Json
        return [PSCustomObject]@{ firstUnhealthyAt = $json.firstUnhealthyAt; consecutiveOk = [int]$json.consecutiveOk }
    }
    return [PSCustomObject]@{ firstUnhealthyAt = $null; consecutiveOk = 0 }
}

function Set-HealthState($firstUnhealthyAt, $consecutiveOk) {
    @{ firstUnhealthyAt = $firstUnhealthyAt; consecutiveOk = $consecutiveOk } | ConvertTo-Json | Set-Content $stateFile
}

try {
    $resp = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 5
    $ok = $resp.ok -eq $true
} catch {
    $ok = $false
}

$state = Get-HealthState

if ($ok) {
    Set-HealthState -firstUnhealthyAt $null -consecutiveOk ($state.consecutiveOk + 1)
    exit 0
}

# Unhealthy
$now = [int][double]::Parse((Get-Date -UFormat %s))
if ($state.firstUnhealthyAt -eq $null) {
    Set-HealthState -firstUnhealthyAt $now -consecutiveOk 0
    exit 0
}
$elapsed = $now - $state.firstUnhealthyAt
if ($elapsed -lt $UnhealthyThresholdSec) {
    exit 0
}

# Unhealthy for > threshold: restart agent
Write-Host "[pm2-health-check] Agent unhealthy for ${elapsed}s — restarting"
Set-HealthState -firstUnhealthyAt $null -consecutiveOk 0
pm2 restart agent
exit 0
