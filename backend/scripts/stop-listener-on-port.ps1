# Stops processes listening on a TCP port (default 5001).
# Use when the API returns HTML/404 because another process is bound to the Flask port.
#   cd MedAssist\backend
#   .\scripts\stop-listener-on-port.ps1
#   flask --app wsgi:app run --host 127.0.0.1 --port 5001

param([int]$Port = 5001)

try {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
} catch {
  Write-Host "No LISTEN on port $Port (or Get-NetTCPConnection unavailable)."
  exit 0
}

$seen = @{}
foreach ($c in $conns) {
  $pid = $c.OwningProcess
  if ($seen[$pid]) { continue }
  $seen[$pid] = $true
  Write-Host "Stopping PID $pid (listening on $Port)"
  Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
}
