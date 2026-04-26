param(
  [string]$Version = "",
  [switch]$SkipTagCheck
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Text) {
  Write-Host ""
  Write-Host "==> $Text" -ForegroundColor Cyan
}

function Get-TauriVersion {
  $confPath = Join-Path $PSScriptRoot "..\src-tauri\tauri.conf.json"
  $conf = Get-Content -Raw -Path $confPath | ConvertFrom-Json
  return [string]$conf.version
}

function Ensure-CleanGit {
  $status = git status --porcelain
  if ($status) {
    throw "Working tree is dirty. Commit or stash changes before release."
  }
}

function Ensure-TagMatchesHead([string]$ExpectedTag) {
  $tagAtHead = git tag --points-at HEAD
  $matched = $false
  foreach ($line in $tagAtHead) {
    if ($line.Trim() -eq $ExpectedTag) {
      $matched = $true
      break
    }
  }
  if (-not $matched) {
    throw "Missing tag on HEAD: $ExpectedTag. Create and push this tag before release."
  }
}

function Build-Installer {
  $env:CARGO_TARGET_DIR = "C:\Users\WANGJ\tauri-cargo-target\app"
  $env:CARGO_BUILD_JOBS = "1"
  $env:RUSTFLAGS = "-C debuginfo=0"
  npx tauri build -b nsis
}

function Copy-Installer([string]$VersionText) {
  $source = "C:\Users\WANGJ\tauri-cargo-target\app\release\bundle\nsis\Todo Calendar_${VersionText}_x64-setup.exe"
  if (-not (Test-Path $source)) {
    throw "Installer not found: $source"
  }

  $targetDir = Join-Path $PSScriptRoot "..\release\v$VersionText"
  if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir | Out-Null
  }
  $target = Join-Path $targetDir "Todo Calendar_${VersionText}_x64-setup.exe"
  Copy-Item -Path $source -Destination $target -Force
  return (Resolve-Path $target).Path
}

try {
  Write-Step "Check git working tree"
  Ensure-CleanGit

  $resolvedVersion = if ($Version) { $Version } else { Get-TauriVersion }
  Write-Step "Release version: $resolvedVersion"

  if (-not $SkipTagCheck) {
    Write-Step "Check git tag matches EXE version"
    Ensure-TagMatchesHead "v$resolvedVersion"
  } else {
    Write-Host "Tag check skipped by -SkipTagCheck" -ForegroundColor Yellow
  }

  Write-Step "Build NSIS installer"
  Build-Installer

  Write-Step "Copy installer to release\\v$resolvedVersion"
  $outputPath = Copy-Installer $resolvedVersion

  Write-Host ""
  Write-Host "Release done" -ForegroundColor Green
  Write-Host "Installer path: $outputPath"
} catch {
  Write-Host ""
  Write-Host "Release failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
