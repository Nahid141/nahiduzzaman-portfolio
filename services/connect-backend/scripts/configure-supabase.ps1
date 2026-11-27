<#
  Private Connect: writes services/connect-backend/.env for the Supabase database (and, optionally,
  Supabase Storage, LiveKit Cloud and an email API). Secrets are read with hidden input, are never
  printed, and land only in the git-ignored .env file, which is then restricted to your Windows user.

    powershell -ExecutionPolicy Bypass -File services\connect-backend\scripts\configure-supabase.ps1

  Press Enter at any optional prompt to keep the value already in .env (or leave it unset).
#>
$ErrorActionPreference = 'Stop'

$Backend = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Backend '.env'
$CertDir = Join-Path $Backend 'certs'
$CertFile = Join-Path $CertDir 'supabase-ca.crt'

# Non-secret connection details from the Supabase "Connect" dialog (Session pooler).
$PoolerHost = 'aws-1-us-east-2.pooler.supabase.com'
$PoolerPort = 5432
$DbName = 'postgres'
$DbUser = 'postgres.pezjgvfjqtkiztgrmeep'
$SupabaseUrl = 'https://pezjgvfjqtkiztgrmeep.supabase.co'

function Read-Secret([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $v = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  # Dashboards display hidden keys as "••••"; copying that display instead of the key is an easy mistake.
  if ($v -match '[^\x20-\x7E]') { throw 'That value contains non-ASCII characters (often a masked "••••" display). Copy the real value and run the script again.' }
  return $v
}

# Existing values are kept unless replaced.
$values = [ordered]@{}
if (Test-Path $EnvFile) {
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*([A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim().Trim('"') }
  }
}

Write-Host ''
Write-Host 'Private Connect: Supabase configuration' -ForegroundColor Cyan
Write-Host "Database: $DbUser @ ${PoolerHost}:$PoolerPort/$DbName (session pooler)"
Write-Host ''

# 1. Database password (required unless already configured)
$hasDb = $values.Contains('DATABASE_URL') -and $values['DATABASE_URL']
$dbPrompt = if ($hasDb) { 'Database password (input hidden; Enter keeps the current one)' } else { 'Database password (input hidden)' }
$password = Read-Secret $dbPrompt
if ($password) {
  # Percent-encode every reserved character so @ : / ? # % in the password cannot break the URL.
  $encoded = [Uri]::EscapeDataString($password)
  $values['DATABASE_URL'] = "postgresql://${DbUser}:$encoded@${PoolerHost}:$PoolerPort/$DbName"
  $password = $null; $encoded = $null
} elseif (-not $hasDb) {
  throw 'A database password is required.'
}

# 2. CA certificate for verify-full TLS (public file, downloaded from the dashboard)
if (-not (Test-Path $CertFile)) {
  Write-Host ''
  Write-Host 'Supabase dashboard > Project Settings > Database > SSL Configuration > Download certificate.'
  $src = Read-Host 'Path to the downloaded certificate (e.g. C:\Users\you\Downloads\prod-ca-2021.crt)'
  $src = $src.Trim('"', ' ')
  if (-not (Test-Path $src)) { throw "Certificate not found: $src" }
  $pem = Get-Content -Raw $src
  if ($pem -notmatch 'BEGIN CERTIFICATE') { throw 'That file is not a PEM certificate.' }
  New-Item -ItemType Directory -Force $CertDir | Out-Null
  Copy-Item $src $CertFile -Force
  Write-Host "Certificate saved to certs\supabase-ca.crt (public CA certificate, safe to commit)."
}
$values['DATABASE_CA_FILE'] = 'certs/supabase-ca.crt'

# 3. Optional services
Write-Host ''
$key = Read-Secret 'Supabase SECRET key for Storage, sb_secret_... (hidden; Enter to skip/keep)'
if ($key) { $values['SUPABASE_URL'] = $SupabaseUrl; $values['SUPABASE_SECRET_KEY'] = $key; $key = $null }

$lkUrl = Read-Host 'LiveKit project URL, wss://....livekit.cloud (Enter to skip/keep)'
if ($lkUrl) {
  if ($lkUrl -notmatch '^wss://') { throw 'The LiveKit URL must start with wss://' }
  $values['LIVEKIT_URL'] = $lkUrl.Trim()
  $values['LIVEKIT_API_KEY'] = (Read-Host 'LiveKit API key (not secret)').Trim()
  $s = Read-Secret 'LiveKit API secret (hidden)'
  if (-not $s) { throw 'The LiveKit API secret is required with a LiveKit URL.' }
  $values['LIVEKIT_API_SECRET'] = $s; $s = $null
}

$provider = Read-Host 'Email API provider: brevo, resend, or Enter to skip/keep'
if ($provider) {
  if ($provider -notin @('brevo', 'resend')) { throw 'Use brevo or resend.' }
  $values['EMAIL_PROVIDER'] = $provider
  $m = Read-Secret "$provider API key (hidden)"
  if (-not $m) { throw 'An API key is required.' }
  $values['EMAIL_API_KEY'] = $m; $m = $null
  $from = Read-Host 'Verified sender address (e.g. you@gmail.com)'
  $values['MAIL_FROM'] = "Private Connect <$($from.Trim())>"
}

# 4. Local development defaults; never overwrite an existing data key.
if (-not $values.Contains('NODE_ENV')) { $values['NODE_ENV'] = 'development' }
if (-not $values.Contains('CONNECT_SITE_ORIGIN')) { $values['CONNECT_SITE_ORIGIN'] = 'http://localhost:3000' }
if (-not $values['CONNECT_DATA_KEY']) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $values['CONNECT_DATA_KEY'] = [Convert]::ToBase64String($bytes)
}

# 5. Write .env (UTF-8 without BOM) and restrict it to the current user.
$lines = foreach ($k in $values.Keys) {
  $v = $values[$k]
  if ($v -match '[\s<>#"]') { "$k=`"$v`"" } else { "$k=$v" }
}
[IO.File]::WriteAllText($EnvFile, (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))
$values = $null; $lines = $null
& icacls $EnvFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

# 6. Confirm git will never pick the file up.
Push-Location $Backend
try {
  git check-ignore -q .env
  if ($LASTEXITCODE -ne 0) { throw '.env is NOT ignored by git. Do not commit; fix .gitignore first.' }
  $tracked = git ls-files .env
  if ($tracked) { throw '.env is tracked by git. Run: git rm --cached services/connect-backend/.env' }
} finally { Pop-Location }

Write-Host ''
Write-Host 'Saved services\connect-backend\.env (git-ignored, readable only by you).' -ForegroundColor Green
Write-Host 'Next (in services\connect-backend):'
Write-Host '  node --env-file=.env --import tsx scripts/verify-db.ts          # test connection, review migrations'
Write-Host '  node --env-file=.env --import tsx scripts/verify-db.ts --migrate'
