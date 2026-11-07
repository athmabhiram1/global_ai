# Starts a throwaway Context Curator stack for the Wave 3 demo apps and eval.
#
# Host ports 8080/8090 are reserved for the long-lived dev container, so this
# stack publishes on 18080/18090 by default. Auth is provisioned the same way
# as scripts/wave0-spike.ps1: either set $env:BF_VIRTUAL_KEY to a provisioned
# key, or set $env:BIFROST_SETUP_TOKEN (default "dev-setup-token") and this
# script disables auth enforcement inside the throwaway container.
# Key=value lines are also read from a .env file in the repo root (skipped
# when absent); explicit process-environment values win over the file.
# See .env.example for every variable the stack consumes.
#
# Usage:
#   ./run-stack.ps1                       # rewrite mode on 18080/18090
#   ./run-stack.ps1 -Mode annotate         # record-only mode
#   ./run-stack.ps1 -Container cc-wave3-2  # second stack elsewhere
param(
    [string]$Image = "context-curator:wave3",
    [string]$Container = "cc-wave3",
    [int]$BifrostPort = 18080,
    [int]$SidecarPort = 18090,
    [string]$Mode = "rewrite"
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "--> $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "  ok  $msg" -ForegroundColor Green }

# Load KEY=VALUE lines from a .env file in the repo root when present.
# Blank lines and '#' comments are skipped; values already present in the
# process environment win over the file.
$dotenv = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (Test-Path $dotenv) {
    Write-Step "loading $dotenv"
    Get-Content $dotenv | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -le 0) { return }
        $name = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim()
        if ($value.Length -ge 2 -and
            (($value.StartsWith('"') -and $value.EndsWith('"')) -or
             ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $current = [System.Environment]::GetEnvironmentVariable($name)
        if (-not $current) {
            [System.Environment]::SetEnvironmentVariable($name, $value)
        }
    }
}

if ($Mode -notin @("annotate", "rewrite", "block")) {
    throw "Mode must be annotate, rewrite, or block"
}

$setupToken = $env:BIFROST_SETUP_TOKEN
if (-not $setupToken) { $setupToken = "dev-setup-token" }

$openaiKey = $env:OPENAI_API_KEY
if (-not $openaiKey) { $openaiKey = "unused" }
$mockKey = $env:MOCK_API_KEY
if (-not $mockKey) { $mockKey = "unused" }
$tavilyKey = $env:TAVILY_API_KEY
if (-not $tavilyKey) { $tavilyKey = "unused" }

$datadir = Join-Path ([System.IO.Path]::GetTempPath()) "cc-stack-$Container"
New-Item -ItemType Directory -Force -Path $datadir | Out-Null

Write-Step "writing $datadir/config.json (plugin mode = $Mode)"
$cfg = Get-Content "$PSScriptRoot/../config/bifrost.json" -Raw | ConvertFrom-Json
$plugin = @($cfg.plugins) | Where-Object { $_.name -eq "context-curator" }
if (-not $plugin) { throw "context-curator plugin block missing from config/bifrost.json" }
$plugin.config.mode = $Mode
$cfg | ConvertTo-Json -Depth 20 | Set-Content (Join-Path $datadir "config.json")

$existing = docker ps -a --filter "name=^${Container}$" --format "{{.Names}}"
if ($existing -eq $Container) {
    Write-Step "removing previous $Container"
    docker rm -f $Container | Out-Null
}

Write-Step "starting $Container ($Image) on :$BifrostPort / :$SidecarPort"
docker run -d --name $Container `
    -p "${BifrostPort}:8080" -p "${SidecarPort}:8090" `
    -e "BIFROST_SETUP_TOKEN=$setupToken" `
    -e "OPENAI_API_KEY=$openaiKey" `
    -e "MOCK_API_KEY=$mockKey" `
    -e "TAVILY_API_KEY=$tavilyKey" `
    -v "${datadir}:/data/bifrost" `
    $Image | Out-Null

$headers = @{}
if ($env:BF_VIRTUAL_KEY) { $headers["x-bf-vk"] = $env:BF_VIRTUAL_KEY }

$failed = $false
foreach ($probe in @(
    @{ Name = "sidecar"; Url = "http://127.0.0.1:$SidecarPort/healthz" },
    @{ Name = "bifrost"; Url = "http://127.0.0.1:$BifrostPort/v1/models" }
)) {
    Write-Step "waiting for $($probe.Name)"
    $up = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            Invoke-RestMethod -Uri $probe.Url -Headers $headers -TimeoutSec 3 | Out-Null
            $up = $true
            break
        } catch {
            # 401 means the service is up but auth-gated; provisioning follows.
            $code = -1
            try { $code = [int]$_.Exception.Response.StatusCode } catch {}
            if ($code -eq 401) { $up = $true; break }
            Start-Sleep -Seconds 2
        }
    }
    if ($up) { Write-Ok "$($probe.Name) listening" } else { Write-Host "  FAIL $($probe.Name)"; $failed = $true }
}

if (-not $failed -and -not $env:BF_VIRTUAL_KEY) {
    Write-Step "disabling auth enforcement for this throwaway container"
    try {
        $cfgBody = @{
            client_config = @{
                allow_direct_keys         = $true
                enforce_auth_on_inference = $false
                log_retention_days        = 7
            }
        } | ConvertTo-Json -Depth 10
        Invoke-RestMethod -Uri "http://127.0.0.1:$BifrostPort/api/config" `
            -Method Put -ContentType "application/json" `
            -Headers @{ "X-Bifrost-Setup-Token" = $setupToken } `
            -Body $cfgBody -TimeoutSec 10 | Out-Null
        Write-Ok "direct keys allowed"
    } catch {
        Write-Host "  WARN auth provisioning failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

if ($failed) { throw "stack failed to start; see docker logs $Container" }

Write-Host ""
Write-Host "Bifrost : http://127.0.0.1:$BifrostPort  (BIFROST_URL)"
Write-Host "Sidecar : http://127.0.0.1:$SidecarPort"
Write-Host "Datadir : $datadir"
