param(
  [string]$Remote = "origin",
  [string]$Branch = "master",
  [int]$MaxAttempts = 30,
  [int]$IntervalSeconds = 10
)

$ErrorActionPreference = "Continue"

function Write-Step([string]$Text) {
  Write-Host ""
  Write-Host "==> $Text" -ForegroundColor Cyan
}

if ($MaxAttempts -lt 1) {
  throw "MaxAttempts 必须 >= 1"
}
if ($IntervalSeconds -lt 1) {
  throw "IntervalSeconds 必须 >= 1"
}

try {
  $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
  Set-Location $repoRoot
} catch {
  throw "无法进入仓库目录：$($_.Exception.Message)"
}

Write-Step "当前仓库状态"
git status -sb

for ($i = 1; $i -le $MaxAttempts; $i++) {
  Write-Step "第 $i/$MaxAttempts 次推送：git push $Remote $Branch"
  git push $Remote $Branch
  if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "推送成功 ✅" -ForegroundColor Green
    git status -sb
    exit 0
  }

  if ($i -lt $MaxAttempts) {
    Write-Host "推送失败，$IntervalSeconds 秒后重试..." -ForegroundColor Yellow
    Start-Sleep -Seconds $IntervalSeconds
  }
}

Write-Host ""
Write-Host "已达到最大重试次数，仍未推送成功 ❌" -ForegroundColor Red
git status -sb
exit 1
