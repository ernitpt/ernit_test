#!/usr/bin/env pwsh
# Console Logger Migration Script - Simple Version

$rootPath = "src"
$excludeDirs = @("utils")

Write-Host "Finding files with console statements..." -ForegroundColor Cyan

$files = Get-ChildItem -Path $rootPath -Recurse -Include *.ts,*.tsx | Where-Object {
    $relativePath = $_.FullName.Replace((Get-Location).Path, "")
    $exclude = $false
    foreach ($dir in $excludeDirs) {
        if ($relativePath -match "\\$dir\\") {
            $exclude = $true
            break
        }
    }
    !$exclude
}

$modifiedCount = 0
$totalConsole = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    
    if ($content -match 'console\.(log|warn|error|info|debug)') {
        $matches = [regex]::Matches($content, 'console\.')
        $totalConsole += $matches.Count
        
        # Add import if not present
        if ($content -notmatch "import.*logger.*from.*utils/logger") {
            $lastImport = [regex]::Match($content, "(?sm)^import\s+.*from\s+['""].*['""];?\s*$")
            if ($lastImport.Success) {
                $pos = $lastImport.Index + $lastImport.Length
                $content = $content.Insert($pos, "`nimport { logger } from '../utils/logger';")
            }
        }
        
        # Replace console with logger
        $content = $content -replace 'console\.log', 'logger.log'
        $content = $content -replace 'console\.warn', 'logger.warn'
        $content = $content -replace 'console\.error', 'logger.error'
        $content = $content -replace 'console\.info', 'logger.info'
        $content = $content -replace 'console\.debug', 'logger.debug'
        
        Set-Content -Path $file.FullName -Value $content -NoNewline -Encoding UTF8
        $modifiedCount++
        
        Write-Host "Modified: $($file.Name) ($($ matches.Count) replacements)" -ForegroundColor Green
    }
}

Write-Host "`nSummary:" -ForegroundColor Cyan
Write-Host "Files modified: $modifiedCount" -ForegroundColor Green
Write-Host "Total console statements replaced: $totalConsole" -ForegroundColor Green
