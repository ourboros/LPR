param(
    [string]$BaseUrl = "http://localhost:5000",
    [switch]$KeepLesson
)

function Get-ErrorMessageFromResponse {
    param($Exception)

    if ($Exception -and $Exception.ErrorDetails -and $Exception.ErrorDetails.Message) {
        return $Exception.ErrorDetails.Message
    }

    return ($Exception.Exception.Message | Out-String).Trim()
}

function Invoke-ChatModeTest {
    param(
        [string]$Name,
        [string]$ApiUrl,
        [hashtable]$Body,
        [int]$MaxChars = -1
    )

    try {
        $response = Invoke-RestMethod -Method Post -Uri $ApiUrl -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 10)

        $content = [string]($response.content)
        $charCount = $content.Length

        $withinLimit = ($MaxChars -lt 0) -or ($charCount -le $MaxChars)

        return [pscustomobject]@{
            Mode = $Name
            Success = $true
            CharCount = $charCount
            Limit = if ($MaxChars -lt 0) { "N/A" } else { $MaxChars }
            Pass = $withinLimit
            Preview = if ($content.Length -gt 80) { $content.Substring(0, 80) + "..." } else { $content }
            Error = ""
        }
    } catch {
        $statusCode = "N/A"
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }

        return [pscustomobject]@{
            Mode = $Name
            Success = $false
            CharCount = 0
            Limit = if ($MaxChars -lt 0) { "N/A" } else { $MaxChars }
            Pass = $false
            Preview = ""
            Error = "HTTP $statusCode - $(Get-ErrorMessageFromResponse $_)"
        }
    }
}

Write-Host "=== LPR chat mode E2E validation ===" -ForegroundColor Cyan
Write-Host "BaseUrl: $BaseUrl" -ForegroundColor Gray

try {
    $health = Invoke-RestMethod -Method Get -Uri "$BaseUrl/health" -TimeoutSec 8
    Write-Host "Health check: OK ($($health.status))" -ForegroundColor Green
} catch {
    Write-Host "Health check failed. Start the service first." -ForegroundColor Red
    Write-Host (Get-ErrorMessageFromResponse $_) -ForegroundColor Yellow
    exit 1
}

$tempLessonPath = Join-Path $env:TEMP "lpr-e2e-lesson.txt"
$lessonId = $null

try {
    $lessonLines = @(
        "Lesson topic: Fraction addition and subtraction",
        "Learning goals:",
        "1. Explain common denominators",
        "2. Solve basic fraction problems",
        "3. Apply fractions in context questions",
        "",
        "Teaching flow:",
        "- Warm-up with a pizza scenario",
        "- Teacher demo and pair practice",
        "- Group share and reflection",
        "",
        "Assessment:",
        "- Oral Q&A",
        "- Worksheet (8 questions)",
        "- Exit ticket (2 questions)"
    )

    ($lessonLines -join "`r`n") | Set-Content -Path $tempLessonPath -Encoding UTF8

    $uploadRaw = curl.exe -s -F "file=@$tempLessonPath" "$BaseUrl/api/upload"
    $upload = $uploadRaw | ConvertFrom-Json

    if (-not $upload.id) {
        throw "Upload succeeded but no lesson id returned. Response: $uploadRaw"
    }

    $lessonId = [long][decimal]$upload.id
    Write-Host "Upload succeeded, lessonId=$lessonId" -ForegroundColor Green

    $results = @()

    $results += Invoke-ChatModeTest -Name "summary" -ApiUrl "$BaseUrl/api/chat" -Body @{
        message = "Generate a concise lesson summary."
        selectedSources = @($lessonId)
        chatHistory = @()
        mode = "summary"
        action = "summary"
        maxChars = 500
    } -MaxChars 500

    $results += Invoke-ChatModeTest -Name "quick-action(analyze)" -ApiUrl "$BaseUrl/api/chat" -Body @{
        message = "Analyze lesson structure and provide top fixes."
        selectedSources = @($lessonId)
        chatHistory = @()
        mode = "quick-action"
        action = "analyze"
        maxChars = 300
    } -MaxChars 300

    $results += Invoke-ChatModeTest -Name "chat-free" -ApiUrl "$BaseUrl/api/chat" -Body @{
        message = "Suggest two adjustments for mixed-level students in one class."
        selectedSources = @($lessonId)
        chatHistory = @()
        mode = "chat-free"
        action = "free"
    } -MaxChars -1

    Write-Host ""
    Write-Host "=== Validation results ===" -ForegroundColor Cyan
    $results | Select-Object Mode, Success, CharCount, Limit, Pass | Format-Table -AutoSize

    Write-Host ""
    Write-Host "=== Preview ===" -ForegroundColor Cyan
    foreach ($item in $results) {
        Write-Host "[$($item.Mode)]" -ForegroundColor Yellow
        if ($item.Success) {
            Write-Host $item.Preview
        } else {
            Write-Host $item.Error -ForegroundColor Red
        }
        Write-Host ""
    }

    $failed = $results | Where-Object { $_.Pass -ne $true }
    if ($failed.Count -gt 0) {
        Write-Host "Validation failed for one or more modes." -ForegroundColor Red
        exit 2
    }

    Write-Host "All mode validations passed." -ForegroundColor Green
    exit 0
} catch {
    Write-Host "Validation script failed." -ForegroundColor Red
    Write-Host (Get-ErrorMessageFromResponse $_) -ForegroundColor Yellow
    exit 1
} finally {
    if ((-not $KeepLesson) -and $lessonId) {
        try {
            $null = Invoke-RestMethod -Method Delete -Uri "$BaseUrl/api/upload/lesson/$lessonId"
            Write-Host "Deleted test lesson lessonId=$lessonId" -ForegroundColor DarkGray
        } catch {
            Write-Host "Could not delete test lesson. Please delete manually: lessonId=$lessonId" -ForegroundColor Yellow
        }
    }

    if (Test-Path $tempLessonPath) {
        Remove-Item $tempLessonPath -Force -ErrorAction SilentlyContinue
    }
}
