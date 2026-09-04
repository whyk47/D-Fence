<#
D-Fence - create the Azure resources. No secrets pass through this script; see
tools/azure-configure.ps1 for those.

    pwsh tools/azure-provision.ps1 -App dfence-sc2006

Safe to re-run: every step checks for an existing resource first, so a half-finished run can be
finished rather than started over.
#>
[CmdletBinding()]
param(
    [string] $App = 'dfence-sc2006',
    [string] $ResourceGroup = 'dfence',
    [string] $Plan = 'dfence-plan',
    # Not a preference. Supabase is in ap-southeast-1, and one dashboard response makes roughly
    # fifteen SEQUENTIAL round trips to it; from another continent the dashboard is slow with a
    # single user. See DEPLOY.md §2.
    [string] $Location = 'southeastasia',
    # B1, not F1: F1 caps CPU at 60 minutes a day and has no Always On, so the process is evicted
    # when idle - and an evicted process runs no ingestion timers, leaving holes in the history the
    # trend figures are computed from.
    [string] $Sku = 'B1'
)

$ErrorActionPreference = 'Stop'
$az = Join-Path $env:ProgramFiles 'Microsoft SDKs\Azure\CLI2\wbin\az.cmd'
if (-not (Test-Path $az)) { throw "Azure CLI not found at $az" }

function Invoke-Az {
    param([string[]] $Arguments)
    $result = & $az @Arguments
    if ($LASTEXITCODE -ne 0) { throw "az $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
    return $result
}

Write-Host "account:"
Invoke-Az @('account', 'show', '--query', '{name:name, user:user.name}', '-o', 'tsv')

# --- resource group ---
$exists = & $az group exists --name $ResourceGroup
if ($exists -eq 'true') {
    Write-Host "resource group $ResourceGroup already exists"
} else {
    Write-Host "creating resource group $ResourceGroup in $Location"
    Invoke-Az @('group', 'create', '--name', $ResourceGroup, '--location', $Location, '-o', 'none')
}

# --- app service plan ---
$planExists = & $az appservice plan list --resource-group $ResourceGroup --query "[?name=='$Plan'] | length(@)" -o tsv
if ($planExists -eq '1') {
    Write-Host "plan $Plan already exists"
} else {
    Write-Host "creating $Sku Linux plan $Plan"
    Invoke-Az @('appservice', 'plan', 'create', '--name', $Plan, '--resource-group', $ResourceGroup,
        '--location', $Location, '--sku', $Sku, '--is-linux', '-o', 'none')
}

# --- web app ---
$appExists = & $az webapp list --resource-group $ResourceGroup --query "[?name=='$App'] | length(@)" -o tsv
if ($appExists -eq '1') {
    Write-Host "web app $App already exists"
} else {
    # NODE:24-lts, not 20: Node 20 has been retired from App Service and `webapp create` rejects
    # it outright. 24 is also what the project develops and tests against, so the deployed runtime
    # and the tested runtime are the same one - which is worth more than the smaller version jump
    # 22 would have been.
    Write-Host "creating web app $App on NODE:24-lts"
    Invoke-Az @('webapp', 'create', '--name', $App, '--resource-group', $ResourceGroup,
        '--plan', $Plan, '--runtime', 'NODE:24-lts', '-o', 'none')
}

# Always On keeps the ingestion timers running when no one is browsing. The health path stops a
# momentary database problem from being read as a dead container - /api/health deliberately does
# not touch Postgres, because a restart cannot fix somebody else's database.
Write-Host 'configuring: always-on, startup command, health check, HTTPS only'
Invoke-Az @('webapp', 'config', 'set', '--name', $App, '--resource-group', $ResourceGroup,
    '--always-on', 'true', '--startup-file', 'npm start', '-o', 'none')
# `--health-check-path` was removed from `az webapp config set` (unrecognized argument on CLI
# 2.90), and its replacement, `--generic-configurations`, takes JSON - which PowerShell mangles on
# the way to a native executable, so az receives `{healthCheckPath: ...}` and fails to parse it.
# Passing the JSON as a file (@path) sidesteps the quoting entirely.
$healthJson = Join-Path ([IO.Path]::GetTempPath()) 'dfence-healthcheck.json'
Set-Content -Path $healthJson -Value '{"healthCheckPath": "/api/health"}' -Encoding ascii
try {
    Invoke-Az @('webapp', 'config', 'set', '--name', $App, '--resource-group', $ResourceGroup,
        '--generic-configurations', "@$healthJson", '-o', 'none')
} finally {
    Remove-Item $healthJson -Force -ErrorAction SilentlyContinue
}
Invoke-Az @('webapp', 'update', '--name', $App, '--resource-group', $ResourceGroup,
    '--https-only', 'true', '-o', 'none')

$host_name = & $az webapp show --name $App --resource-group $ResourceGroup --query defaultHostName -o tsv
Write-Host ''
Write-Host "Provisioned: https://$host_name"
Write-Host 'Next: tools/azure-configure.ps1 (it will ask for the seed manager credentials), THEN deploy.'
Write-Host 'That order matters - the manager account is created on first boot.'
