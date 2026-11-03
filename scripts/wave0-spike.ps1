# Wave 0.3 - prove the two load-bearing assumptions.
#
#   1. A PreRequestHook mutation to ChatRequest.Input reaches the provider.
#   2. The same mutation survives a provider fallback.
#
# The plugin, when CC_SPIKE_MARKER is set, prefixes every message with "<marker>|".
# The mock provider echoes exactly what it received. So if the marker comes back,
# the rewrite was in the request the provider saw.
#
# Usage:  powershell -File scripts/wave0-spike.ps1 [-Image context-curator:dev]

param(
    [string]$Image = "context-curator:dev",
    [string]$Container = "cc-spike",
    [string]$Marker = "SPIKE42"
)

# Fresh hosts enforce virtual-key auth (401 virtual_key_required). Either set
# $env:BF_VIRTUAL_KEY to a provisioned key (sent as x-bf-vk on every call), or
# set $env:BIFROST_SETUP_TOKEN so this script disables auth enforcement inside
# the throwaway container via PUT /api/config. Without one of the two, the
# assumption probes below fail with 401 instead of proving anything.

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host ""; Write-Host "== $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "   PASS  $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "   FAIL  $msg" -ForegroundColor Red }

Write-Step "removing any previous container"
docker rm -f $Container 2>$null | Out-Null

Write-Step "starting $Image"
docker run -d --name $Container `
    -p 8080:8080 -p 8090:8090 `
    -e "CC_SPIKE_MARKER=$Marker" `
    -e "OPENAI_API_KEY=unused" `
    -e "MOCK_API_KEY=unused" `
    -e "BIFROST_SETUP_TOKEN=$env:BIFROST_SETUP_TOKEN" `
    $Image | Out-Null

$headers = @{}
if ($env:BF_VIRTUAL_KEY) { $headers["x-bf-vk"] = $env:BF_VIRTUAL_KEY }

$failed = $false
try {
    Write-Step "waiting for the sidecar health check"
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $r = Invoke-RestMethod -Uri "http://127.0.0.1:8090/healthz" -TimeoutSec 2
            if ($r.status -eq "ok") { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 1000
    }
    if (-not $ready) {
        Write-Fail "sidecar never became healthy"
        $failed = $true
    } else {
        Write-Ok "sidecar healthy"
    }

    if (-not $failed) {
        Write-Step "waiting for Bifrost on :8080"
        $bifrost = $false
        for ($i = 0; $i -lt 60; $i++) {
            try {
                Invoke-WebRequest -Uri "http://127.0.0.1:8080/v1/models" -TimeoutSec 2 | Out-Null
                $bifrost = $true
                break
            } catch {
                if ($_.Exception.Response) { $bifrost = $true; break }
            }
            Start-Sleep -Milliseconds 1000
        }
        if (-not $bifrost) {
            Write-Fail "bifrost never came up"
            $failed = $true
        } else {
            Write-Ok "bifrost listening"
        }
    }

    # ---------------------------------------------------------------
    # Auth: allow direct (keyless) inference inside this throwaway
    # container when a setup token is provided. Best-effort: if the
    # endpoint or payload drifts, the probes below surface 401 and the
    # failure names auth instead of silently proving nothing.
    # ---------------------------------------------------------------
    if (-not $failed -and -not $env:BF_VIRTUAL_KEY -and $env:BIFROST_SETUP_TOKEN) {
        Write-Step "disabling auth enforcement for this throwaway container"
        try {
            $cfgBody = @{
                client_config = @{
                    allow_direct_keys = $true
                    enforce_auth_on_inference = $false
                }
            } | ConvertTo-Json -Depth 10
            Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/config" `
                -Method Put -ContentType "application/json" `
                -Headers @{ "x-bf-setup-token" = $env:BIFROST_SETUP_TOKEN } `
                -Body $cfgBody -TimeoutSec 10 | Out-Null
            Write-Ok "direct keys allowed"
        } catch {
            Write-Host "   WARN  auth provisioning failed: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    # ---------------------------------------------------------------
    # Assumption 1: the rewrite reaches the provider.
    # ---------------------------------------------------------------
    if (-not $failed) {
        Write-Step "assumption 1 - rewrite reaches the provider"
        $expect1 = $Marker + "|hello-from-test"
        $body1 = @{
            model    = "mock/mock-model"
            messages = @(@{ role = "user"; content = "hello-from-test" })
        } | ConvertTo-Json -Depth 10

        $resp1 = Invoke-RestMethod -Uri "http://127.0.0.1:8080/v1/chat/completions" `
            -Method Post -ContentType "application/json" -Headers $headers -Body $body1 -TimeoutSec 60
        $text1 = [string]$resp1.choices[0].message.content

        Write-Host "   reply: $text1"
        if ($text1 -notmatch [regex]::Escape($expect1)) {
            Write-Fail "marker did not survive to the provider"
            $failed = $true
        } else {
            Write-Ok "marker present - PreRequestHook mutation reached the provider"
        }
    }

    # ---------------------------------------------------------------
    # Assumption 2: the rewrite survives a fallback.
    # The primary provider points at a closed port, so attempt 1 fails
    # and Bifrost fails over to the mock provider.
    # ---------------------------------------------------------------
    if (-not $failed) {
        Write-Step "assumption 2 - rewrite survives a provider fallback"
        $expect2 = $Marker + "|hello-from-fallback"
        $body2 = @{
            model     = "broken/broken-model"
            fallbacks = @("mock/mock-model")
            messages  = @(@{ role = "user"; content = "hello-from-fallback" })
        } | ConvertTo-Json -Depth 10

        $resp2 = Invoke-RestMethod -Uri "http://127.0.0.1:8080/v1/chat/completions" `
            -Method Post -ContentType "application/json" -Headers $headers -Body $body2 -TimeoutSec 60
        $text2 = [string]$resp2.choices[0].message.content

        Write-Host "   reply: $text2"
        if ($text2 -notmatch [regex]::Escape($expect2)) {
            Write-Fail "marker lost on failover - the rewrite does not survive fallbacks"
            $failed = $true
        } else {
            Write-Ok "marker present after failover - mutation is committed, not per-attempt"
        }
    }
}
finally {
    Write-Step "container logs (tail)"
    docker logs $Container --tail 60 2>&1 | Out-Host
    Write-Step "cleaning up"
    docker rm -f $Container 2>$null | Out-Null
}

if ($failed) {
    Write-Host ""
    Write-Host "Wave 0.3 FAILED." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Wave 0.3 passed." -ForegroundColor Green
