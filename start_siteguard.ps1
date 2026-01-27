<#
.SYNOPSIS
    Master startup script for SiteGuard
.DESCRIPTION
    Starts the SiteGuard system in either Public Server mode (for Vercel) or Local Dev mode.
#>

$host.UI.RawUI.WindowTitle = "SiteGuard Launcher"

function Show-Header {
    Clear-Host
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "             SITEGUARD LAUNCHER                   " -ForegroundColor White
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Kill-Processes {
    Write-Host "Cleaning up old processes..." -ForegroundColor Gray
    Stop-Process -Name "ngrok" -ErrorAction SilentlyContinue
    Stop-Process -Name "uvicorn" -ErrorAction SilentlyContinue
    Stop-Process -Name "python" -ErrorAction SilentlyContinue
}

function Start-Backend {
    param([string]$Title = "SiteGuard Backend")
    Write-Host "Starting Backend..." -ForegroundColor Yellow
    $cmd = "cd '$PSScriptRoot'; .\venv\Scripts\activate; uvicorn app.app.main:app --host 0.0.0.0 --port 8000 --reload"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd -PassThru
}

function Start-Frontend {
    Write-Host "Starting Frontend (Local)..." -ForegroundColor Yellow
    $cmd = "cd '$PSScriptRoot\frontend-react'; npm run dev"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd -PassThru
}

function Start-Ngrok {
    Write-Host "Starting Ngrok Tunnel..." -ForegroundColor Yellow
    # Refresh PATH to ensure ngrok is found
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "ngrok http 8000" -PassThru
}

# Main Menu
while ($true) {
    Show-Header
    Write-Host "Please select a mode:" -ForegroundColor Green
    Write-Host "1. Public Server Mode" -ForegroundColor White
    Write-Host "   (Starts Backend + Ngrok. Use this for the public Vercel website)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Local Developer Mode" -ForegroundColor White
    Write-Host "   (Starts Backend + Local Frontend. Use this for coding/testing)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Q. Quit" -ForegroundColor Red
    Write-Host ""
    
    $selection = Read-Host "Select Option (1/2/Q)"

    switch ($selection) {
        "1" {
            Show-Header
            Kill-Processes
            Write-Host "Launching Public Server Mode..." -ForegroundColor Green
            Start-Backend
            Start-Sleep -Seconds 2
            Start-Ngrok
            Write-Host ""
            Write-Host "✅ System started!" -ForegroundColor Green
            Write-Host "   - Backend is running"
            Write-Host "   - Ngrok tunnel is active"
            Write-Host ""
            Write-Host "Press any key to return to menu..."
            $null = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        }
        "2" {
            Show-Header
            Kill-Processes
            Write-Host "Launching Local Developer Mode..." -ForegroundColor Green
            Start-Backend
            Start-Sleep -Seconds 2
            Start-Frontend
            Write-Host ""
            Write-Host "✅ System started!" -ForegroundColor Green
            Write-Host "   - Backend is running"
            Write-Host "   - Frontend is running at http://localhost:5173"
            Write-Host ""
            Write-Host "Press any key to return to menu..."
            $null = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        }
        "Q" {
            exit
        }
        "q" {
            exit
        }
        Default {
            Write-Host "Invalid selection. Please try again." -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
}
