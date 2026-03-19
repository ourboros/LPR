# ============================================
# LPR Startup Script - Same-Origin App Mode
# ============================================
#
# Usage: .\start.ps1
# Stop:  .\stop.ps1
# Dev legacy mode: .\start.ps1 -LegacyFrontend
#
# ============================================

param(
    [switch]$LegacyFrontend,
    [switch]$NoBrowser
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Get-EnvFileValue {
    param(
        [string]$FilePath,
        [string]$Key
    )

    if (-not (Test-Path $FilePath)) {
        return $null
    }

    $line = Get-Content $FilePath | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
    if (-not $line) {
        return $null
    }

    return ($line -split "=", 2)[1]
}

function Show-RecentBackendLogs {
    param(
        $Job,
        [int]$LineCount = 30
    )

    if (-not $Job) {
        return
    }

    $jobOutput = @(Receive-Job $Job -Keep -ErrorAction SilentlyContinue)

    if (-not $jobOutput -or $jobOutput.Count -eq 0) {
        Write-Host "No backend logs available." -ForegroundColor DarkYellow
        return
    }

    Write-Host "Showing last $LineCount backend log lines:" -ForegroundColor Yellow
    $jobOutput | Select-Object -Last $LineCount | ForEach-Object {
        Write-Host $_
    }
}

function Test-EnvValuePresent {
    param(
        [string]$Value
    )

    return -not [string]::IsNullOrWhiteSpace($Value) -and $Value -ne "your_api_key_here"
}

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

$envFilePath = ".\backend\.env"
$mongoUri = Get-EnvFileValue -FilePath $envFilePath -Key "MONGODB_URI"
$mongoDbName = Get-EnvFileValue -FilePath $envFilePath -Key "MONGODB_DB_NAME"
$geminiApiKey = Get-EnvFileValue -FilePath $envFilePath -Key "GEMINI_API_KEY"

if (-not (Test-Path $envFilePath)) {
    Write-Host "ERROR Missing backend/.env" -ForegroundColor Red
    Write-Host "Please create backend/.env from backend/.env.example first." -ForegroundColor Yellow
    pause
    exit 1
}

if ([string]::IsNullOrWhiteSpace($mongoUri)) {
    $mongoUri = "mongodb://127.0.0.1:27017/"
}

if ([string]::IsNullOrWhiteSpace($mongoDbName)) {
    $mongoDbName = "lpr"
}

$missingEnvKeys = @()

if (-not (Test-EnvValuePresent $geminiApiKey)) {
    $missingEnvKeys += "GEMINI_API_KEY"
}

if (-not (Test-EnvValuePresent $mongoUri)) {
    $missingEnvKeys += "MONGODB_URI"
}

if (-not (Test-EnvValuePresent $mongoDbName)) {
    $missingEnvKeys += "MONGODB_DB_NAME"
}

if ($missingEnvKeys.Count -gt 0) {
    Write-Host "ERROR Missing or invalid .env settings:" -ForegroundColor Red
    $missingEnvKeys | ForEach-Object { Write-Host "- $_" -ForegroundColor Yellow }
    Write-Host "Please update backend/.env before starting the system." -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "INFO MongoDB URI: $mongoUri" -ForegroundColor DarkCyan
Write-Host "INFO MongoDB DB:  $mongoDbName" -ForegroundColor DarkCyan

# ============================================
# 3. Check Ports
# ============================================
Write-Host "[3/5] Checking ports..." -ForegroundColor Yellow

$port5000 = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue

if ($LegacyFrontend) {
    $port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
} else {
    $port3000 = $null
}

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

$backendReady = $false

for ($attempt = 1; $attempt -le 10; $attempt++) {
    Start-Sleep -Seconds 1

    try {
        $null = Invoke-WebRequest -Uri "http://localhost:5000/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        $backendReady = $true
        break
    } catch {
        if ($backendJob.State -eq "Failed" -or $backendJob.State -eq "Completed" -or $backendJob.State -eq "Stopped") {
            break
        }
    }
}

if ($backendReady) {
    Write-Host "OK Backend server running (Job ID: $($backendJob.Id))" -ForegroundColor Green
} else {
    Write-Host "ERROR Backend failed to start" -ForegroundColor Red
    Write-Host "Checking logs:" -ForegroundColor Yellow
    Show-RecentBackendLogs -Job $backendJob -LineCount 30
    Stop-Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob -ErrorAction SilentlyContinue
    pause
    exit 1
}

# ============================================
# 5. Optional Legacy Frontend (Port 3000)
# ============================================
if ($LegacyFrontend) {
    Write-Host "[5/5] Starting legacy frontend server (Port 3000)..." -ForegroundColor Yellow

    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
        "-Command",
        "cd '$($PWD.Path)'; npx http-server -p 3000 -c-1"
    )

    Start-Sleep -Seconds 3
    Write-Host "OK Legacy frontend server running" -ForegroundColor Green
} else {
    Write-Host "[5/5] Skipping legacy frontend server (same-origin mode)" -ForegroundColor Yellow
}

# ============================================
# 6. Open Browser
# ============================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  System Ready!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend:  http://localhost:5000" -ForegroundColor Cyan
Write-Host "App:      http://localhost:5000/app/upload.html" -ForegroundColor Cyan
if ($LegacyFrontend) {
    Write-Host "Legacy UI: http://localhost:3000" -ForegroundColor Cyan
}
Write-Host ""

if ($NoBrowser) {
    Write-Host "Skipping browser launch (-NoBrowser)." -ForegroundColor Yellow
} else {
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
            Start-Process $path "http://localhost:5000/app/upload.html"
            $opened = $true
            Write-Host "OK Browser opened" -ForegroundColor Green
            break
        }
    }

    if (-not $opened) {
        # Try default browser
        try {
            Start-Process "http://localhost:5000/app/upload.html"
            Write-Host "OK Browser opened (default)" -ForegroundColor Green
        } catch {
            Write-Host "WARNING Could not open browser automatically" -ForegroundColor Yellow
            Write-Host "Please visit: http://localhost:5000/app/upload.html" -ForegroundColor Cyan
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Instructions" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "- Stop servers: .\stop.ps1" -ForegroundColor White
Write-Host "- Legacy mode:  .\start.ps1 -LegacyFrontend" -ForegroundColor White
Write-Host "- No browser:   .\start.ps1 -NoBrowser" -ForegroundColor White
Write-Host "- View logs: Get-Job | Receive-Job" -ForegroundColor White
Write-Host "- Backend health: http://localhost:5000/health" -ForegroundColor White
Write-Host ""
Write-Host "Backend Job ID: $($backendJob.Id)" -ForegroundColor Gray
if ($LegacyFrontend) {
    Write-Host "Legacy frontend: Running in hidden window" -ForegroundColor Gray
} else {
    Write-Host "App mode: Backend serves /app static files" -ForegroundColor Gray
}
Write-Host ""
