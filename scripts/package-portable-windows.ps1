param(
  [string]$Version = "0.1.0",
  [switch]$RebuildPython
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$releaseRoot = Join-Path $root ".release"
$portableRoot = Join-Path $releaseRoot "Audio2txt-portable"
$outDir = Join-Path $root "packages"
$zipPath = Join-Path $outDir "audio2txt-v$Version-windows-portable.zip"
$nodeExe = Join-Path $portableRoot "audio2txt.exe"
$pythonExeSource = Join-Path $root "dist-python\transcribe.exe"

if (Test-Path -LiteralPath $releaseRoot) {
  Remove-Item -LiteralPath $releaseRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $portableRoot | Out-Null
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Push-Location $root
try {
  npm run build
  npx pkg server/package-entry.cjs --targets node18-win-x64 --output $nodeExe

  if ($RebuildPython -or -not (Test-Path -LiteralPath $pythonExeSource -PathType Leaf)) {
    py -3.12 -m PyInstaller `
      --onefile `
      --name transcribe `
      --distpath dist-python `
      --workpath .release/pyinstaller-build `
      --specpath .release/pyinstaller-spec `
      --exclude-module torch `
      --exclude-module torchaudio `
      --exclude-module torchvision `
      --exclude-module tensorflow `
      --exclude-module fastapi `
      --exclude-module gradio `
      --exclude-module duckdb `
      --exclude-module tensorboardX `
      --exclude-module tvm `
      --exclude-module opennmt `
      --exclude-module fairseq `
      --noconfirm `
      scripts/transcribe.py
  }
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

if (Test-Path -LiteralPath $pythonExeSource -PathType Leaf) {
  Copy-Item -LiteralPath $pythonExeSource -Destination (Join-Path $portableRoot "scripts\transcribe.exe") -Force
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

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $portableRoot "*") -DestinationPath $zipPath -Force

Write-Host "Created $zipPath"
