<#
  Copies one value from services/connect-backend/.env to the clipboard without showing it, for pasting into the
  Render environment form. The clipboard is cleared automatically after 60 seconds.

    powershell -ExecutionPolicy Bypass -File services\connect-backend\scripts\copy-env-value.ps1 DATABASE_URL
#>
param([Parameter(Mandatory = $true)][ValidatePattern('^[A-Z][A-Z0-9_]*$')][string]$Name)
$ErrorActionPreference = 'Stop'

$EnvFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
$value = $null
foreach ($l in [IO.File]::ReadAllLines($EnvFile)) {
  if ($l -match "^\s*$Name=(.*)$") { $value = $Matches[1].Trim(); if ($value -match '^"(.*)"$') { $value = $Matches[1] } }
}
if (-not $value) { throw "$Name is not set in .env" }
if ($value -match '[^\x20-\x7E]') { throw "$Name in .env contains non-ASCII characters (a masked value); fix it with set-secret.ps1 first." }

Set-Clipboard -Value $value
$value = $null
Write-Host "$Name copied to the clipboard. Paste it into Render now; the clipboard clears in 60 seconds." -ForegroundColor Green
Start-Sleep -Seconds 60
Set-Clipboard -Value ' '
Write-Host 'Clipboard cleared.'
