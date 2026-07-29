param(
  [switch]$FreshNodeModules,
  [string]$StagePath = ""
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$stage = if ($StagePath) { $StagePath } else { Join-Path ([System.IO.Path]::GetTempPath()) "Audio2txt-electron-app" }
$sourcePackage = Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json

if (Test-Path -LiteralPath $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $stage | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stage "scripts") | Out-Null

Copy-Item -LiteralPath (Join-Path $root "electron") -Destination (Join-Path $stage "electron") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root "server") -Destination (Join-Path $stage "server") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root "dist") -Destination (Join-Path $stage "dist") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root "build") -Destination (Join-Path $stage "build") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root "dist-python\transcribe") -Destination (Join-Path $stage "scripts\transcribe-runtime") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root "requirements.txt") -Destination (Join-Path $stage "requirements.txt") -Force
Copy-Item -LiteralPath (Join-Path $root "README.md") -Destination (Join-Path $stage "README.md") -Force

if ($FreshNodeModules) {
  $packageForInstall = [ordered]@{
    name = $sourcePackage.name
    productName = $sourcePackage.productName
    version = $sourcePackage.version
    main = "electron/main.cjs"
    description = $sourcePackage.description
    author = $sourcePackage.author
    dependencies = $sourcePackage.dependencies
  }
  $packageForInstall | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $stage "package.json") -Encoding ASCII
  Push-Location $stage
  try {
    npm install --omit=dev
  } finally {
    Pop-Location
  }
} else {
  New-Item -ItemType Junction -Path (Join-Path $stage "node_modules") -Target (Join-Path $root "node_modules") | Out-Null
}

$electronPackage = [ordered]@{
  name = $sourcePackage.name
  productName = $sourcePackage.productName
  version = $sourcePackage.version
  main = "electron/main.cjs"
  description = $sourcePackage.description
  author = $sourcePackage.author
  dependencies = $sourcePackage.dependencies
  build = [ordered]@{
    appId = "com.shim1999.audio2txt"
    electronVersion = ($sourcePackage.devDependencies.electron -replace "^[^\d]*", "")
    extraMetadata = [ordered]@{
      name = $sourcePackage.name
      productName = $sourcePackage.productName
      version = $sourcePackage.version
      main = "electron/main.cjs"
    }
    artifactName = '${productName}-${version}-${os}-${arch}.${ext}'
    asar = $true
    disableDefaultIgnoredFiles = $true
    directories = [ordered]@{
      output = (Join-Path $root "desktop-release")
    }
    extraResources = @(
      [ordered]@{ from = "dist"; to = "dist" },
      [ordered]@{ from = "build"; to = "build" },
      [ordered]@{ from = "scripts/transcribe-runtime"; to = "scripts/transcribe-runtime" },
      [ordered]@{ from = "requirements.txt"; to = "requirements.txt" },
      [ordered]@{ from = "README.md"; to = "README.md" },
      [ordered]@{ from = "package.json"; to = "package.json" }
    )
    win = [ordered]@{
      target = @("nsis")
    }
    nsis = [ordered]@{
      oneClick = $false
      allowToChangeInstallationDirectory = $true
      createDesktopShortcut = $true
      createStartMenuShortcut = $true
      shortcutName = "Audio2txt"
    }
    publish = @(
      [ordered]@{
        provider = "github"
        owner = "SHIM1999"
        repo = "Audio2txt"
      }
    )
  }
}

$electronPackage | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $stage "package.json") -Encoding ASCII
Write-Host "Staged Electron app at $stage"
