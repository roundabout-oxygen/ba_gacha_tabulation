# PowerShell build script for SCHALE Gacha Analyzer
# Merges index.html, style.css, and app.js into a single gas_sidebar.html for GAS.

$ErrorActionPreference = "Stop"

$dir = Get-Location
$indexHtmlPath = Join-Path $dir "index.html"
$styleCssPath = Join-Path $dir "style.css"
$appJsPath = Join-Path $dir "app.js"
$outputPath = Join-Path $dir "gas_sidebar.html"

Write-Output "Reading source files..."
$indexHtml = Get-Content -Raw -Path $indexHtmlPath -Encoding utf8
$styleCss = Get-Content -Raw -Path $styleCssPath -Encoding utf8
$appJs = Get-Content -Raw -Path $appJsPath -Encoding utf8

Write-Output "Inlining styles and scripts..."
# Remove local css and js links
$indexHtml = $indexHtml -replace '<link rel="stylesheet" href="style.css">', ''
$indexHtml = $indexHtml -replace '<script src="app.js"></script>', ''

# Inject css inside head
$styleBlock = "<style>`n$styleCss`n</style>`n</head>"
$indexHtml = $indexHtml -replace '</head>', $styleBlock

# Inject js inside body
$scriptBlock = "<script>`n$appJs`n</script>`n</body>"
$indexHtml = $indexHtml -replace '</body>', $scriptBlock

Write-Output "Writing output to gas_sidebar.html..."
[System.IO.File]::WriteAllText($outputPath, $indexHtml, [System.Text.Encoding]::UTF8)

Write-Output "Successfully compiled gas_sidebar.html for Google Apps Script!"
