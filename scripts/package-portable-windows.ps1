param(
  [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$releaseRoot = Join-Path $root ".release"
$portableRoot = Join-Path $releaseRoot "Audio2txt-portable"
$outDir = Join-Path $root "packages"
$zipPath = Join-Path $outDir "audio2txt-v$Version-windows-portable.zip"
$nodeExe = Join-Path $portableRoot "audio2txt.exe"

if (Test-Path -LiteralPath $releaseRoot) {
  Remove-Item -LiteralPath $releaseRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $portableRoot | Out-Null
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Push-Location $root
try {
  npm run build
  npx pkg server/package-entry.cjs --targets node18-win-x64 --output $nodeExe
} finally {
  Pop-Location
}

$items = @(
  "dist",
  "server",
  "scripts",
  "requirements.txt",
  "README.md",
  "install-windows.bat",
  "update-windows.bat"
)

foreach ($item in $items) {
  $source = Join-Path $root $item
  $destination = Join-Path $portableRoot $item

  if (Test-Path -LiteralPath $source -PathType Container) {
    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
  } elseif (Test-Path -LiteralPath $source -PathType Leaf) {
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
}

Get-ChildItem -LiteralPath $portableRoot -Recurse -Force -Directory |
  Where-Object { $_.Name -in @("__pycache__", ".venv", "node_modules", "uploads") } |
  Sort-Object FullName -Descending |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }

@"
@echo off
setlocal
echo Starting Audio2txt...
start "" "http://localhost:3001"
audio2txt.exe
"@ | Set-Content -LiteralPath (Join-Path $portableRoot "Audio2txt.bat") -Encoding ASCII

@"
@echo off
setlocal
echo Installing Python dependencies for Audio2txt...
py -3.12 -m pip install -r requirements.txt
if errorlevel 1 exit /b 1
echo Done. Run Audio2txt.bat
"@ | Set-Content -LiteralPath (Join-Path $portableRoot "Install Python Dependencies.bat") -Encoding ASCII

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $portableRoot "*") -DestinationPath $zipPath -Force

Write-Host "Created $zipPath"
