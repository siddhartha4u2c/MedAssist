# Stop anything listening on TCP 5001, then start MedAssist Flask (single process).
$ErrorActionPreference = "SilentlyContinue"
$port = 5001
$pids = @()
try {
    $pids = Get-NetTCPConnection -LocalPort $port -State Listen | Select-Object -ExpandProperty OwningProcess -Unique
} catch {
    $lines = netstat -ano | Select-String ":$port\s+.*LISTENING"
    foreach ($line in $lines) {
        $parts = ($line.Line -split '\s+') | Where-Object { $_ -ne "" }
        if ($parts.Count -ge 5) {
            $last = $parts[-1]
            if ($last -match '^\d+$') { $pids += [int]$last }
        }
    }
    $pids = $pids | Sort-Object -Unique
}
foreach ($pid in $pids) {
    if ($pid -and $pid -gt 0) {
        Write-Host "Stopping PID $pid (was using port $port)"
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
}
Start-Sleep -Milliseconds 400

$backendRoot = Split-Path $PSScriptRoot -Parent
Set-Location $backendRoot
$py = Join-Path $backendRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Error "Missing venv: $py — create venv and pip install -r requirements.txt first."
    exit 1
}
if (-not (Test-Path (Join-Path $backendRoot "wsgi.py"))) {
    Write-Error "wsgi.py not found under $backendRoot"
    exit 1
}
Write-Host "Starting Flask on http://127.0.0.1:$port ..."
& $py -m flask --app wsgi:app run --host 127.0.0.1 --port $port
