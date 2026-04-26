# Run Flask with this project's venv Python (avoids conda/global `flask` using the wrong codebase).
Set-Location $PSScriptRoot
$py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Error "Missing .venv. From backend: python -m venv .venv && .\.venv\Scripts\pip install -r requirements.txt"
    exit 1
}
Write-Host "Using: $py"
& $py -m flask --app wsgi:app run --host 127.0.0.1 --port 5001
