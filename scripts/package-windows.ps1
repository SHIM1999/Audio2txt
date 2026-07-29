param(
  [string]$Version = "0.1.4"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$releaseRoot = Join-Path $root ".release"
$packageRoot = Join-Path $releaseRoot "Audio2txt"
$outDir = Join-Path $root "packages"
$zipPath = Join-Path $outDir "audio2txt-v$Version-source.zip"

if (Test-Path -LiteralPath $releaseRoot) {
  Remove-Item -LiteralPath $releaseRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$items = @(
  ".oxlintrc.json",
  "index.html",
  "package-lock.json",
  "package.json",
  "README.md",
  "requirements.txt",
  "tsconfig.app.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "vite.config.ts",
  "install-windows.bat",
  "start-windows.bat",
  "update-windows.bat",
  "public",
  "scripts",
  "server",
  "src"
)

foreach ($item in $items) {
  $source = Join-Path $root $item
  $destination = Join-Path $packageRoot $item

  if (Test-Path -LiteralPath $source -PathType Container) {
    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
  } elseif (Test-Path -LiteralPath $source -PathType Leaf) {
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
}

Get-ChildItem -LiteralPath $packageRoot -Recurse -Force -Directory |
  Where-Object { $_.Name -in @("__pycache__", ".venv", "node_modules", "dist", "uploads") } |
  Sort-Object FullName -Descending |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $zipPath -Force

Write-Host "Created $zipPath"
