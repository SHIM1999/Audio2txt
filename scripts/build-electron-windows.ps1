param(
  [switch]$SkipPortableBuild
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$stage = Join-Path ([System.IO.Path]::GetTempPath()) "Audio2txt-electron-app"
$sourcePackage = Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$electronVersion = $sourcePackage.devDependencies.electron -replace "^[^\d]*", ""
$outDir = Join-Path $root "desktop-release-packager"

Push-Location $root
try {
  if (-not $SkipPortableBuild) {
    npm run package:portable -- -RebuildPython
  }

  powershell -ExecutionPolicy Bypass -File scripts/stage-electron-windows.ps1 -FreshNodeModules -StagePath $stage
  npx electron-packager $stage Audio2txt `
    --platform=win32 `
    --arch=x64 `
    --electron-version=$electronVersion `
    --out=$outDir `
    --overwrite `
    --asar `
    --ignore="^/dist($|/)" `
    --ignore="^/scripts($|/)" `
    --ignore="^/README.md$" `
    --ignore="^/requirements.txt$" `
    --ignore="^/package-lock.json$" `
    --extra-resource="$stage\dist" `
    --extra-resource="$stage\scripts" `
    --extra-resource="$stage\package.json" `
    --extra-resource="$stage\README.md" `
    --extra-resource="$stage\requirements.txt"

  node scripts/create-squirrel-installer.cjs
} finally {
  Pop-Location
}
