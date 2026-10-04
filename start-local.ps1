# Starts the bot locally with auto-restart on file changes.
# Reads BOT_TOKEN and ADMIN_TELEGRAM_ID from .env (git-ignored; created from .env.example on first run).
Set-Location $PSScriptRoot

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "Created .env - fill in BOT_TOKEN and ADMIN_TELEGRAM_ID, then run this script again."
  exit 1
}

Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $_ -notmatch '^\s*#') {
    Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim('"')
  }
}

if (-not $env:BOT_TOKEN -or $env:BOT_TOKEN -like '*token-from-botfather*' -or $env:ADMIN_TELEGRAM_ID -in @($null, '', '0')) {
  Write-Host "Set BOT_TOKEN and ADMIN_TELEGRAM_ID in .env first."
  exit 1
}

if (-not (Test-Path node_modules)) { npm install }
npm run dev
