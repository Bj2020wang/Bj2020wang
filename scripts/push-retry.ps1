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
  throw "MaxAttempts must be >= 1"
}
if ($IntervalSeconds -lt 1) {
  throw "IntervalSeconds must be >= 1"
}

try {
  $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
  Set-Location $repoRoot
} catch {
  throw "Cannot enter repo directory: $($_.Exception.Message)"
}

Write-Step "Current repository status"
git status -sb

for ($i = 1; $i -le $MaxAttempts; $i++) {
  Write-Step "Attempt ${i}/${MaxAttempts}: git push $Remote $Branch"
  git push $Remote $Branch
  if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Push succeeded." -ForegroundColor Green
    git status -sb
    exit 0
  }

  if ($i -lt $MaxAttempts) {
    Write-Host "Push failed. Retry in $IntervalSeconds seconds..." -ForegroundColor Yellow
    Start-Sleep -Seconds $IntervalSeconds
  }
}

Write-Host ""
Write-Host "Reached max attempts. Push still failed." -ForegroundColor Red
git status -sb
exit 1
