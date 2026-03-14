# ============================================
# LPR Stop Script
# ============================================
#
# Usage: .\stop.ps1
#
# Stops backend (5000) and optional legacy frontend (3000)
#
# ============================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Stopping LPR System" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Stop background jobs
Write-Host "Checking background jobs..." -ForegroundColor Yellow

$jobs = Get-Job -Name "LPR-*" -ErrorAction SilentlyContinue
if ($jobs) {
    foreach ($job in $jobs) {
        Write-Host "Stopping job: $($job.Name) (ID: $($job.Id))" -ForegroundColor Yellow
        Stop-Job $job
        Remove-Job $job
    }
    Write-Host "OK Background jobs stopped" -ForegroundColor Green
} else {
    Write-Host "OK No background jobs found" -ForegroundColor Green
}

# Stop Port 5000 (Backend)
Write-Host "Checking Port 5000 (Backend)..." -ForegroundColor Yellow

$connections5000 = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue
if ($connections5000) {
    foreach ($conn in $connections5000) {
        $processId = $conn.OwningProcess
        if ($processId -le 4) {
            continue
        }
        try {
            $process = Get-Process -Id $processId -ErrorAction Stop
            Write-Host "Stopping: $($process.ProcessName) (PID: $processId)" -ForegroundColor Yellow
            Stop-Process -Id $processId -Force
            Write-Host "OK Port 5000 freed" -ForegroundColor Green
        } catch {
            Write-Host "WARNING Could not stop PID: $processId" -ForegroundColor Red
        }
    }
} else {
    Write-Host "OK Port 5000 available" -ForegroundColor Green
}

# Stop Port 3000 (Legacy Frontend, optional)
Write-Host "Checking Port 3000 (Legacy Frontend, optional)..." -ForegroundColor Yellow

$connections3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($connections3000) {
    foreach ($conn in $connections3000) {
        $processId = $conn.OwningProcess
        if ($processId -le 4) {
            continue
        }
        try {
            $process = Get-Process -Id $processId -ErrorAction Stop
            Write-Host "Stopping: $($process.ProcessName) (PID: $processId)" -ForegroundColor Yellow
            Stop-Process -Id $processId -Force
            Write-Host "OK Port 3000 freed" -ForegroundColor Green
        } catch {
            Write-Host "WARNING Could not stop PID: $processId" -ForegroundColor Red
        }
    }
} else {
    Write-Host "OK Port 3000 available (legacy frontend not running)" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  All Services Stopped" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
