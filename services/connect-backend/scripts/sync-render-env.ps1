<#
  Copies the six secret settings from services/connect-backend/.env to the Render service through the Render REST
  API, verifies each remote value against the local one (by SHA-256, never displayed), leaves every other Render
  variable untouched, then deploys, follows the deploy and checks the health endpoint.

    powershell -ExecutionPolicy Bypass -File services\connect-backend\scripts\sync-render-env.ps1

  The Render API key is asked for with hidden input and kept only in memory for this run.
  Options: -ServiceId srv-...  -NoDeploy  -TimeoutMinutes 20
#>
param(
  [string]$ServiceId = 'srv-dc50uvsipgvc73egqs00',
  [switch]$NoDeploy,
  [int]$TimeoutMinutes = 20,
  [string]$ApiBase = 'https://api.render.com/v1'
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Names = @('CONNECT_DATA_KEY', 'DATABASE_URL', 'SUPABASE_SECRET_KEY', 'EMAIL_API_KEY', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET')
$EnvFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'

function Fail([string]$Message) { Write-Host "ERROR: $Message" -ForegroundColor Red; exit 1 }
function Sha([string]$Value) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value))) } finally { $sha.Dispose() }
}

# 1. Read and validate the local values.
if (-not (Test-Path $EnvFile)) { Fail ".env not found at $EnvFile" }
$local = @{}
foreach ($line in [IO.File]::ReadAllLines($EnvFile)) {
  if ($line -match '^\s*([A-Z0-9_]+)=(.*)$' -and $Names -contains $Matches[1]) {
    $v = $Matches[2].Trim()
    if ($v.Length -ge 2 -and $v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
    $local[$Matches[1]] = $v
  }
}
$problems = @()
foreach ($n in $Names) {
  $v = $local[$n]
  if (-not $v) { $problems += "$n is missing or empty"; continue }
  if ($v -match '[^\x21-\x7E]') { $problems += "$n contains spaces or non-ASCII characters (a masked or mis-copied value?)"; continue }
  switch ($n) {
    'CONNECT_DATA_KEY' {
      try { $bytes = [Convert]::FromBase64String($v) } catch { $bytes = $null }
      if (-not $bytes -or $bytes.Length -ne 32 -or [Convert]::ToBase64String($bytes) -ne $v) { $problems += "CONNECT_DATA_KEY is not base64 of exactly 32 bytes" }
      else { Write-Host "CONNECT_DATA_KEY decodes to 32 bytes." }
    }
    'DATABASE_URL' {
      if ($v -notmatch '^postgres(ql)?://[^@/]+@[^/]+/[^/?]+$') { $problems += 'DATABASE_URL is not a postgresql://user:password@host:port/db URL' }
      elseif ($v -match 'sslmode=') { $problems += 'DATABASE_URL must not contain sslmode (TLS uses the bundled CA file)' }
    }
    'SUPABASE_SECRET_KEY' { if ($v -notmatch '^sb_secret_') { $problems += 'SUPABASE_SECRET_KEY does not start with sb_secret_' } }
    'LIVEKIT_API_KEY' { if ($v -notmatch '^API') { $problems += 'LIVEKIT_API_KEY does not start with API' } }
    'LIVEKIT_API_SECRET' { if ($v.Length -lt 32) { $problems += 'LIVEKIT_API_SECRET is shorter than 32 characters' } }
    'EMAIL_API_KEY' { if ($v.Length -lt 16) { $problems += 'EMAIL_API_KEY is shorter than 16 characters' } }
  }
}
if ($problems) { $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }; Fail 'Fix .env first; nothing was sent to Render.' }
Write-Host "All six local values are present and well-formed."

# Anything printed from Render (errors, logs) passes through this filter first.
$dbPassword = ''
if ($local['DATABASE_URL'] -match '^postgres(ql)?://[^:]+:([^@]+)@') { $dbPassword = [Uri]::UnescapeDataString($Matches[2]) }
$redactions = @($Names | ForEach-Object { @{ Name = $_; Value = $local[$_] } })
function Redact([string]$Text) {
  if (-not $Text) { return $Text }
  foreach ($r in $redactions) { $Text = $Text.Replace($r.Value, "<$($r.Name)>") }
  if ($dbPassword.Length -ge 4) { $Text = $Text.Replace($dbPassword, '<db-password>') }
  return $Text
}

# 2. Render API key (hidden input; RENDER_API_KEY is honoured for unattended use).
$apiKey = $env:RENDER_API_KEY
if (-not $apiKey) {
  $secure = Read-Host -Prompt 'Render API key (input hidden)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
if (-not $apiKey) { Fail 'No Render API key entered.' }
$headers = @{ Authorization = "Bearer $apiKey"; Accept = 'application/json' }

function Api([string]$Method, [string]$Path, $Body = $null) {
  $req = @{ Method = $Method; Uri = "$ApiBase$Path"; Headers = $headers; UseBasicParsing = $true }
  if ($null -ne $Body) {
    $req.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress -Depth 5))
    $req.ContentType = 'application/json; charset=utf-8'
  }
  try { return Invoke-RestMethod @req }
  catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    $hint = switch ($status) { 401 { ' (API key rejected)' } 403 { ' (the API key lacks a permission for this call)' } 404 { ' (wrong service id, or the key cannot see it)' } default { '' } }
    throw "Render API $Method $Path failed: HTTP $status$hint. $(Redact $_.ErrorDetails.Message)"
  }
}

# 3. Service and current variables.
$service = Api GET "/services/$ServiceId"
Write-Host "Service: $($service.name) ($ServiceId), branch $($service.branch)"
$before = @{}
$cursor = $null
do {
  $page = Api GET ("/services/$ServiceId/env-vars?limit=100" + $(if ($cursor) { "&cursor=$cursor" } else { '' }))
  foreach ($item in @($page)) { if ($item.envVar) { $before[$item.envVar.key] = Sha ([string]$item.envVar.value); $cursor = $item.cursor } }
} while (@($page).Count -eq 100)
$others = @($before.Keys | Where-Object { $Names -notcontains $_ } | Sort-Object)
Write-Host "Render has $($before.Count) variables; $($others.Count) others will be left untouched."

# 4. Update only the six variables, one by one (never the replace-all endpoint).
foreach ($n in $Names) {
  $state = if (-not $before.ContainsKey($n)) { 'added' } elseif ($before[$n] -eq (Sha $local[$n])) { 'unchanged' } else { 'updated' }
  if ($state -ne 'unchanged') { [void](Api PUT "/services/$ServiceId/env-vars/$n" @{ value = $local[$n] }) }
  Write-Host ("  {0,-20} {1}" -f $n, $state)
}

# 5. Verify every remote value, and that no other variable changed or disappeared.
$after = @{}
$cursor = $null
do {
  $page = Api GET ("/services/$ServiceId/env-vars?limit=100" + $(if ($cursor) { "&cursor=$cursor" } else { '' }))
  foreach ($item in @($page)) { if ($item.envVar) { $after[$item.envVar.key] = Sha ([string]$item.envVar.value); $cursor = $item.cursor } }
} while (@($page).Count -eq 100)
$bad = 0
foreach ($n in $Names) {
  $ok = $after[$n] -eq (Sha $local[$n])
  if (-not $ok) { $bad++ }
  Write-Host ("  verify {0,-20} {1}" -f $n, $(if ($ok) { "match ($($local[$n].Length) chars)" } else { 'MISMATCH' })) -ForegroundColor $(if ($ok) { 'Green' } else { 'Red' })
}
foreach ($o in $others) { if ($after[$o] -ne $before[$o]) { $bad++; Write-Host "  other variable $o changed or disappeared" -ForegroundColor Red } }
if ($bad) { Fail 'Verification failed; not deploying.' }
Write-Host "All six values match .env; the other $($others.Count) variables are unchanged." -ForegroundColor Green
$local = $null

if ($NoDeploy) { exit 0 }

# 6. Deploy and follow it.
$deploy = Api POST "/services/$ServiceId/deploys" @{ clearCache = 'do_not_clear' }
Write-Host "Deploy $($deploy.id) started."
$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
$last = ''
do {
  Start-Sleep -Seconds 10
  $d = Api GET "/services/$ServiceId/deploys/$($deploy.id)"
  if ($d.status -ne $last) { Write-Host ("  {0:HH:mm:ss}  {1}" -f (Get-Date), $d.status); $last = $d.status }
} while ($d.status -in @('created', 'queued', 'build_in_progress', 'update_in_progress', 'pre_deploy_in_progress') -and (Get-Date) -lt $deadline)

if ($d.status -ne 'live') {
  Write-Host "Deploy ended as '$($d.status)'. Last log lines (secrets redacted):" -ForegroundColor Red
  try {
    $logs = Api GET ("/logs?ownerId=$($service.ownerId)&resource=$ServiceId&direction=backward&limit=60")
    @($logs.logs) | Sort-Object timestamp | ForEach-Object { Write-Host ('    ' + (Redact ([string]$_.message))) }
  } catch { Write-Host "  (could not read logs: $($_.Exception.Message))" }
  exit 1
}

# 7. Health check (Render URL, then the custom domain if it already resolves).
$urls = @("$($service.serviceDetails.url)/api/v1/health")
if ($service.serviceDetails.url -notmatch 'connect-api\.fnunahiduzzaman\.com') { $urls += 'https://connect-api.fnunahiduzzaman.com/api/v1/health' }
foreach ($u in $urls) {
  try {
    $h = Invoke-RestMethod -Uri $u -UseBasicParsing -TimeoutSec 90
    Write-Host "Health $u -> $($h.status)" -ForegroundColor Green
  } catch { Write-Host "Health $u -> not reachable yet ($($_.Exception.Message))" -ForegroundColor Yellow }
}
Write-Host 'Done.'
