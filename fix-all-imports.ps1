#!/usr/bin/env pwsh
# Fix all misplaced logger imports

Write-Host "Fixing all misplaced logger imports..." -ForegroundColor Cyan

$files = Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx
$fixedCount = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    
    # Check if file has misplaced logger import (appears after line 50)
    $lines = $content -split "`r?`n"
    $importLineNumber = -1
    
    for ($i = 20; $i -lt $lines.Length; $i++) {
        if ($lines[$i] -match "^import \{ logger \} from") {
            $importLineNumber = $i
            break
        }
    }
    
    if ($importLineNumber -gt 0) {
        Write-Host "Fixing: $($file.Name) (line $($importLineNumber + 1))" -ForegroundColor Yellow
        
        # Remove the misplaced import
        $content = $content -replace "`r?`nimport \{ logger \} from ['""]\.\.\/utils\/logger['""];?`r?`n?", "`n"
        
        # Find last import statement position
        $importMatches = [regex]::Matches($content, "(?m)^import .+;")
        
        if ($importMatches.Count -gt 0) {
            $lastImport = $importMatches[$importMatches.Count - 1]
            $insertPos = $lastImport.Index + $lastImport.Length
            
            # Insert logger import after last import
            $content = $content.Insert($insertPos, "`nimport { logger } from '../utils/logger';")
            
            Set-Content -Path $file.FullName -Value $content -NoNewline -Encoding UTF8
            $fixedCount++
            Write-Host "  Fixed!" -ForegroundColor Green
        }
    }
}

Write-Host "`nFixed $fixedCount files" -ForegroundColor Green
Write-Host "Running TypeScript check..." -ForegroundColor Cyan
& npm run build
