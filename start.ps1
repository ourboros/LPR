# ============================================
# LPR Startup Script - Background Mode
# ============================================
# 
# Usage: .\start.ps1
# Stop:  .\stop.ps1
#
# ============================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LPR - Lesson Plan Review System" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# 1. Check Node.js
# ============================================
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow

try {
    $nodeVersion = node --version
    Write-Host "OK Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR Node.js not installed" -ForegroundColor Red
    Write-Host "Please install from: https://nodejs.org/" -ForegroundColor Yellow
    pause
    exit 1
}

# ============================================
# 2. Check Backend Dependencies
# ============================================
Write-Host "[2/5] Checking backend dependencies..." -ForegroundColor Yellow

$backendNodeModules = ".\backend\node_modules"

if (-not (Test-Path $backendNodeModules)) {
    Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
    Push-Location backend
    npm install --silent
    Pop-Location
    Write-Host "OK Backend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "OK Backend dependencies ready" -ForegroundColor Green
}

# ============================================
# 3. Check Ports
# ============================================
Write-Host "[3/5] Checking ports..." -ForegroundColor Yellow

$port5000 = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue
$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue

if ($port5000 -or $port3000) {
    Write-Host "WARNING Ports in use - stopping old processes..." -ForegroundColor Yellow
    .\stop.ps1 2>&1 | Out-Null
    Start-Sleep -Seconds 2
}

Write-Host "OK Ports available" -ForegroundColor Green

# ============================================
# 4. Start Backend Server (Background)
# ============================================
Write-Host "[4/5] Starting backend server (Port 5000)..." -ForegroundColor Yellow

$backendJob = Start-Job -Name "LPR-Backend" -ScriptBlock {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
    Set-Location $using:PWD
    Set-Location backend
    node server.js
}

Start-Sleep -Seconds 3

# Check backend health
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Host "OK Backend server running (Job ID: $($backendJob.Id))" -ForegroundColor Green
} catch {
    Write-Host "ERROR Backend failed to start" -ForegroundColor Red
    Write-Host "Checking logs:" -ForegroundColor Yellow
    Receive-Job $backendJob
    Stop-Job $backendJob
    Remove-Job $backendJob
    pause
    exit 1
}

# ============================================
# 5. Start Frontend Server (Hidden Window)
# ============================================
Write-Host "[5/5] Starting frontend server (Port 3000)..." -ForegroundColor Yellow

# Use hidden window for frontend
Start-Process powershell -WindowStyle Hidden -ArgumentList @(
    "-Command",
    "cd '$($PWD.Path)'; npx http-server -p 3000 -c-1"
)

Start-Sleep -Seconds 3
Write-Host "OK Frontend server running" -ForegroundColor Green

# ============================================
# 6. Open Browser
# ============================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  System Ready!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend:  http://localhost:5000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Opening Chrome browser..." -ForegroundColor Yellow

Start-Sleep -Seconds 1

# Try Chrome paths
$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$opened = $false
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        Start-Process $path "http://localhost:3000"
        $opened = $true
        Write-Host "OK Browser opened" -ForegroundColor Green
        break
    }
}

if (-not $opened) {
    # Try default browser
    try {
        Start-Process "http://localhost:3000"
        Write-Host "OK Browser opened (default)" -ForegroundColor Green
    } catch {
        Write-Host "WARNING Could not open browser automatically" -ForegroundColor Yellow
        Write-Host "Please visit: http://localhost:3000" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Instructions" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "- Stop servers: .\stop.ps1" -ForegroundColor White
Write-Host "- View logs: Get-Job | Receive-Job" -ForegroundColor White
Write-Host "- Backend health: http://localhost:5000/health" -ForegroundColor White
Write-Host ""
Write-Host "Backend Job ID: $($backendJob.Id)" -ForegroundColor Gray
Write-Host "Frontend: Running in hidden window" -ForegroundColor Gray
Write-Host ""
