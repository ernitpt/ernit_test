#!/usr/bin/env pwsh
# Fix logger import paths for files in subdirectories

Write-Host "Fixing logger import paths..." -ForegroundColor Cyan

$fixedCount = 0

# Files in screens/recipient/ need ../../utils/logger
$recipientFiles = Get-ChildItem -Path "src/screens/recipient" -Filter *.tsx
foreach ($file in $recipientFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    if ($content -match "import \{ logger \} from '\.\./utils/logger'") {
        $content = $content -replace "import \{ logger \} from '\.\./utils/logger'", "import { logger } from '../../utils/logger'"
        Set-Content -Path $file.FullName -Value $content -NoNewline -Encoding UTF8
        Write-Host "Fixed: $($file.Name)" -ForegroundColor Green
        $fixedCount++
    }
}

# Files in screens/giver/ need ../../utils/logger  
$giverFiles = Get-ChildItem -Path "src/screens/giver" -Filter *.tsx
foreach ($file in $giverFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    if ($content -match "import \{ logger \} from '\.\./utils/logger'") {
        $content = $content -replace "import \{ logger \} from '\.\./utils/logger'", "import { logger } from '../../utils/logger'"
        Set-Content -Path $file.FullName -Value $content -NoNewline -Encoding UTF8
        Write-Host "Fixed: $($file.Name)" -ForegroundColor Green
        $fixedCount++
    }
}

Write-Host "`nFixed $fixedCount import paths" -ForegroundColor Green
Write-Host "Running build check..." -ForegroundColor Cyan
& npm run build
