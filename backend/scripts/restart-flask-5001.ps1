# Stop every process listening on TCP port 5001, then start MedAssist Flask once (.venv).
# Use this when the browser gets HTML 404/405 from the wrong or duplicate server on 5001.
$ErrorActionPreference = "SilentlyContinue"

function Get-PidsListeningOn5001 {
    $pids = [System.Collections.Generic.HashSet[int]]::new()
    try {
        foreach ($c in Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction Stop) {
            if ($c.OwningProcess -gt 0) { [void]$pids.Add($c.OwningProcess) }
        }
    } catch {
        # ignore; try netstat below
    }
    if ($pids.Count -eq 0) {
        $raw = netstat -ano 2>$null
        foreach ($line in $raw) {
            if ($line -match "LISTENING" -and $line -match ":5001\s") {
                $parts = ($line -split "\s+") | Where-Object { $_ -ne "" }
                $last = $parts[$parts.Count - 1]
                if ($last -match "^\d+$") {
                    $pidVal = [int]$last
                    if ($pidVal -gt 0) { [void]$pids.Add($pidVal) }
                }
            }
        }
    }
    return @($pids)
}

$pids = Get-PidsListeningOn5001
foreach ($procId in $pids) {
    Write-Host ('Stopping PID {0} (was listening on port 5001)...' -f $procId)
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1

$backendRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $backendRoot

# Avoid the dev reloader spawning a second Python process (confusing when debugging port 5001).
$env:FLASK_ENV = "production"
$env:FLASK_DEBUG = "0"

$py = Join-Path $backendRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Error ('Missing {0} - create the venv first (python -m venv .venv).' -f $py)
    exit 1
}

Write-Host ''
Write-Host ('Starting Flask: {0} -m flask --app wsgi:app run --host 127.0.0.1 --port 5001' -f $py)
Write-Host 'Sanity checks (expect JSON from MedAssist, never HTML):'
Write-Host '  GET  http://127.0.0.1:5001/api/v1/patient/reports/healthz   (no auth - confirms this is MedAssist)'
Write-Host '  GET  http://127.0.0.1:5001/api/v1/patient/reports   (401 JSON without Bearer; HTML 404 = wrong app on port)'
Write-Host '  GET  http://127.0.0.1:5001/api/v1/symptoms/chat   (probe; confirms route table)'
Write-Host '  GET  http://127.0.0.1:5001/api/v1/symptoms/info'
Write-Host '  GET  http://127.0.0.1:5001/api/v1/appointments/ping'
Write-Host '  POST http://127.0.0.1:5001/api/v1/appointments/{id}/provision-video  (requires JWT)'
Write-Host ''

& $py -m flask --app wsgi:app run --host 127.0.0.1 --port 5001
