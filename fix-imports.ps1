#!/usr/bin/env pwsh
# Fix misplaced logger imports

Write-Host "🔍 Finding and fixing misplaced logger imports..." -ForegroundColor Cyan

$files = Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx
$fixedCount = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    
    # Check if file has logger import in wrong place (not at top)
    if ($content -match '(?m)^(?!import ).*\r?\n^import \{ logger \}') {
        Write-Host "Fixing: $($file.Name)" -ForegroundColor Yellow
        
        # Remove all logger imports
        $content = $content -replace '(?m)^import \{ logger \} from [''"]\.\.\/utils\/logger[''"]; ?\r?\n?', ''
        
        # Find last import statement
        $importMatches = [regex]::Matches($content, '(?m)^import .+ from .+;')
        if ($importMatches.Count -gt 0) {
            $lastImport = $importMatches[$importMatches.Count - 1]
            $insertPos = $lastImport.Index + $lastImport.Length
            
            # Insert logger import after last import
            $content = $content.Insert($insertPos, "`nimport { logger } from '../utils/logger';")
            
            Set-Content -Path $file.FullName -Value $content -NoNewline -Encoding UTF8
            $fixedCount++
            Write-Host "  ✅ Fixed" -ForegroundColor Green
        }
    }
}

Write-Host "`n📊 Fixed $fixedCount files" -ForegroundColor Cyan
