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
    throw "工作区有未提交改动，请先提交或暂存后再发布。"
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
    throw "当前 HEAD 未打标签 $ExpectedTag。请先执行: git tag -a $ExpectedTag -m `"发布 $ExpectedTag`" && git push origin $ExpectedTag"
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
    throw "未找到安装包: $source"
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
  Write-Step "校验 Git 工作区"
  Ensure-CleanGit

  $resolvedVersion = if ($Version) { $Version } else { Get-TauriVersion }
  Write-Step "发布版本: $resolvedVersion"

  if (-not $SkipTagCheck) {
    Write-Step "校验 Git 标签与 EXE 版本一致"
    Ensure-TagMatchesHead "v$resolvedVersion"
  } else {
    Write-Host "已跳过标签校验（-SkipTagCheck）" -ForegroundColor Yellow
  }

  Write-Step "开始打包 NSIS 安装包"
  Build-Installer

  Write-Step "复制安装包到 release\\v$resolvedVersion"
  $outputPath = Copy-Installer $resolvedVersion

  Write-Host ""
  Write-Host "发布完成" -ForegroundColor Green
  Write-Host "安装包路径: $outputPath"
} catch {
  Write-Host ""
  Write-Host "发布失败: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
