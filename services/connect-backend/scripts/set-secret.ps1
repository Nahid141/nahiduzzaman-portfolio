<#
  Replaces one value in services/connect-backend/.env with hidden input, leaving every other line untouched.

    powershell -ExecutionPolicy Bypass -File services\connect-backend\scripts\set-secret.ps1 LIVEKIT_API_SECRET

  Copy the value with the dashboard's copy button: a value made of mask characters (for example ••••) is refused.
#>
param([Parameter(Mandatory = $true)][ValidatePattern('^[A-Z][A-Z0-9_]*$')][string]$Name)
$ErrorActionPreference = 'Stop'

$EnvFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
if (-not (Test-Path $EnvFile)) { throw 'No .env yet; run configure-supabase.ps1 first.' }

$secure = Read-Host -Prompt "$Name (input hidden)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

if (-not $value) { throw 'Nothing entered; .env is unchanged.' }
if ($value -match '[^\x21-\x7E]') {
  $value = $null
  throw 'That value contains spaces or non-ASCII characters (often the dashboard''s hidden "••••" display). Reveal or copy the real value and try again. .env is unchanged.'
}

$line = if ($value -match '[<>#"]') { "$Name=`"$value`"" } else { "$Name=$value" }
$lines = [Collections.Generic.List[string]]::new()
$found = $false
foreach ($l in [IO.File]::ReadAllLines($EnvFile)) {
  if ($l -match "^\s*$Name=") { $lines.Add($line); $found = $true } else { $lines.Add($l) }
}
if (-not $found) { $lines.Add($line) }
[IO.File]::WriteAllText($EnvFile, (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))
$value = $null; $line = $null; $lines = $null
Write-Host "$Name updated in services\connect-backend\.env ($(if ($found) { 'replaced' } else { 'added' }))." -ForegroundColor Green
