$ErrorActionPreference = "Stop"
$ProjectRoot = "C:\Users\abep2\.gemini\antigravity\scratch\Siteguard"
$VenvPath = "$ProjectRoot\venv"
$FrontendPath = "$ProjectRoot\frontend-react"

# Cleanup ports 8000 and 5173
Write-Host "Cleaning up existing processes..."
try {
    # 1. Kill processes by Port
    $p8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
    if ($p8000) { Stop-Process -Id $p8000.OwningProcess -Force -ErrorAction SilentlyContinue }
    $p5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
    if ($p5173) { Stop-Process -Id $p5173.OwningProcess -Force -ErrorAction SilentlyContinue }

    # 2. Kill Helper Processes (Python/Node) globally to be safe
    Get-Process -Name "python", "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

    # 3. Close previous SiteGuard Windows (Prevent Accumulation)
    Get-Process | Where-Object { $_.MainWindowTitle -eq "SiteGuard Backend" -or $_.MainWindowTitle -eq "SiteGuard Frontend" } | Stop-Process -Force -ErrorAction SilentlyContinue
    
} catch {
    Write-Warning "Cleanup minor error. Proceeding..."
}

# Backend Setup
$env:DATABASE_URL = "sqlite+aiosqlite:///$ProjectRoot/siteguard.db"

Write-Host "Running Database Migrations..."
Set-Location $ProjectRoot
try {
    & "$VenvPath\Scripts\python.exe" -m alembic upgrade head
} catch {
    Write-Warning "Migrations failed or already applied. Proceeding..."
}

Write-Host "Starting Backend Service..."
# Included 'taskkill' in the command so if the window stays open, user can kill it easily or script handles it next time.
# Added title setting.
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "`$host.ui.RawUI.WindowTitle = 'SiteGuard Backend'; Set-Location '$ProjectRoot'; `$env:DATABASE_URL='sqlite+aiosqlite:///$ProjectRoot/siteguard.db'; & '$VenvPath\Scripts\python.exe' -m uvicorn app.app.main:app --reload --port 8000"

# Frontend Setup
Write-Host "Starting Frontend Service..."
Set-Location $FrontendPath
# Ensure Node is in Path for the new process
$NodePath = "C:\Program Files\nodejs"
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "`$host.ui.RawUI.WindowTitle = 'SiteGuard Frontend'; cd '$FrontendPath'; `$env:Path = '$NodePath;' + `$env:Path; npm run dev"

Write-Host "Siteguard is starting! Check the new windows."
