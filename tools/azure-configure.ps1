<#
D-Fence - push the local configuration into Azure App Settings.

    pwsh tools/azure-configure.ps1 -App dfence-sc2006 -ResourceGroup dfence

Why this exists rather than a block of commands in DEPLOY.md: the values are secrets, and the two
ways of getting them into Azure by hand are both bad. Typing them into a terminal puts them in
PSReadLine's history file; pasting them into a chat window or a committed script is worse. This
reads them straight out of `src/.env` - which is gitignored and already the source of truth - and
hands them to `az` without ever printing one.

It prints key NAMES and never key VALUES. If you see a secret in this output, that is a bug.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $App,
    [Parameter(Mandatory = $true)] [string] $ResourceGroup,
    [string] $EnvFile = "$PSScriptRoot\..\src\.env"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $EnvFile)) {
    throw "No env file at $EnvFile. Copy src/.env.example to src/.env and fill it in first."
}

# Parse KEY="value" / KEY=value, ignoring comments and blanks.
$env_values = @{}
foreach ($line in Get-Content $EnvFile) {
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
    $split = $trimmed.IndexOf('=')
    if ($split -lt 1) { continue }
    $key = $trimmed.Substring(0, $split).Trim()
    $value = $trimmed.Substring($split + 1).Trim().Trim('"').Trim("'")
    if ($value -ne '') { $env_values[$key] = $value }
}

# ONE_MAP_TOKEN is deliberately NOT forwarded. A pasted token expires three days after it is
# minted, and a stale one on a long-running host is a geocoding outage with a confusing cause;
# with the credentials present the gateway mints and refreshes its own.
$forward = @(
    'DATABASE_URL',
    'ONE_MAP_EMAIL',
    'ONE_MAP_PASSWORD',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_KEY'
)

$missing = $forward | Where-Object { -not $env_values.ContainsKey($_) }
if ($missing -contains 'DATABASE_URL') {
    throw 'DATABASE_URL is absent from the env file. Without it the deployed server has no database.'
}
if ($missing.Count -gt 0) {
    Write-Host "  not present locally, so not forwarded: $($missing -join ', ')"
}

# The seed manager. Asked for here rather than defaulted, because the development default
# (manager@d-fence.local / dfence2026) is printed in the start-up log, and on a public URL that is
# an Operations Manager account with a published password. The account is created on FIRST boot, so
# this has to be set before the first deployment, not after.
Write-Host ''
Write-Host 'Seed Operations Manager account for the deployed instance.'
$seedEmail = Read-Host '  email'
$seedSecret = Read-Host '  password' -AsSecureString
$seedPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seedSecret))

if ([string]::IsNullOrWhiteSpace($seedEmail) -or [string]::IsNullOrWhiteSpace($seedPassword)) {
    throw 'Both are required. Leaving them blank would seed the published default.'
}
if ($seedPassword -eq 'dfence2026') {
    throw 'That is the development default, and it is in the repository. Choose another.'
}

$settings = @()
foreach ($key in $forward) {
    if ($env_values.ContainsKey($key)) { $settings += "$key=$($env_values[$key])" }
}
$settings += "DFENCE_SEED_MANAGER_EMAIL=$seedEmail"
$settings += "DFENCE_SEED_MANAGER_PASSWORD=$seedPassword"
# 10.3.2. Azure terminates TLS at its front end and forwards x-forwarded-proto, which ExpressApp
# already reads - so the redirect and HSTS behave, rather than looping as a naive req.secure would.
$settings += 'DFENCE_REQUIRE_HTTPS=true'
# Ship what was built locally; do not let Oryx build. Oryx runs `npm run build`, which needs
# esbuild, which is a devDependency it prunes first.
$settings += 'SCM_DO_BUILD_DURING_DEPLOYMENT=false'
# No PORT setting: App Service on Linux supplies PORT itself, and server.ts already reads
# `process.env.PORT ?? 3000`. Pinning it here would only be a way to get it wrong.

Write-Host ''
Write-Host "Setting $($settings.Count) app settings on $App (names only):"
foreach ($s in $settings) { Write-Host "  $($s.Split('=')[0])" }

# --output none matters: without it `az` echoes the full settings list, secrets included, to stdout.
az webapp config appsettings set --name $App --resource-group $ResourceGroup --settings @settings --output none
if ($LASTEXITCODE -ne 0) { throw "az failed with exit code $LASTEXITCODE" }

Write-Host ''
Write-Host 'Done. Verify with:  az webapp config appsettings list --name ' -NoNewline
Write-Host "$App --resource-group $ResourceGroup --query ""[].name"" -o tsv"
