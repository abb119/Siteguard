# SiteGuard Public Deployment Script
# Starts backend and ngrok tunnel for public access

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SiteGuard - Public Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Refresh PATH
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Step 1: Start Backend in new window (from Siteguard root directory)
Write-Host "`n[1/2] Starting Backend Server..." -ForegroundColor Yellow
$backendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; .\venv\Scripts\activate; uvicorn app.app.main:app --host 0.0.0.0 --port 8000 --reload" -PassThru

# Wait for backend to start
Start-Sleep -Seconds 5

# Step 2: Start ngrok tunnel
Write-Host "[2/2] Starting ngrok tunnel..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  NGROK TUNNEL STARTING..." -ForegroundColor Green
Write-Host "  Copy the 'Forwarding' URL below" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Start ngrok (this will show the tunnel URL)
ngrok http 8000
