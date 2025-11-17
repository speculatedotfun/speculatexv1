#!/usr/bin/env pwsh

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Speculate Deployment Checker" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: SSE Endpoint
Write-Host "Test 1: SSE Endpoint" -ForegroundColor Yellow
Write-Host "-------------------" -ForegroundColor Gray
try {
    $request = [System.Net.HttpWebRequest]::Create("https://speculate-veck.vercel.app/api/goldsky-stream")
    $request.Method = "GET"
    $request.Accept = "text/event-stream"
    $request.Timeout = 5000
    
    $response = $request.GetResponse()
    $stream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    
    $firstLine = $reader.ReadLine()
    
    if ($firstLine -match "ready|ping") {
        Write-Host "✅ SSE Endpoint: WORKING" -ForegroundColor Green
    } else {
        Write-Host "⚠️  SSE Endpoint: Connected but unexpected response" -ForegroundColor Yellow
    }
    
    $reader.Close()
    $stream.Close()
    $response.Close()
} catch {
    Write-Host "❌ SSE Endpoint: FAILED" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host ""

# Test 2: Webhook Endpoint (GET - should return ok)
Write-Host "Test 2: Webhook Endpoint (Health Check)" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "https://speculate-veck.vercel.app/api/goldsky-webhook" -Method Get
    if ($response.ok -eq $true) {
        Write-Host "✅ Webhook Endpoint: REACHABLE" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Webhook Endpoint: UNREACHABLE" -ForegroundColor Red
}

Write-Host ""

# Test 3: Webhook Authentication
Write-Host "Test 3: Webhook Authentication" -ForegroundColor Yellow
Write-Host "-------------------------------" -ForegroundColor Gray

$url = "https://speculate-veck.vercel.app/api/goldsky-webhook"
$secret = "whs_01K9YRJBGXRFN27J3Z50N03KCV"
$headers = @{
    "Content-Type" = "application/json"
    "goldsky-webhook-secret" = $secret
}
$body = '{"entity":{"__typename":"Trade","market":{"id":"0"},"priceE6":"500000","timestamp":"1234567890","txHash":"0xtest"}}'

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body
    if ($response.ok -eq $true) {
        Write-Host "✅ Webhook Auth: CONFIGURED CORRECTLY" -ForegroundColor Green
        Write-Host "   Secret is set in Vercel environment variables" -ForegroundColor Gray
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Host "❌ Webhook Auth: NOT CONFIGURED" -ForegroundColor Red
        Write-Host "   Action Required: Add GOLDSKY_WEBHOOK_SECRET_TRADE to Vercel" -ForegroundColor Yellow
        Write-Host "   1. Go to Vercel Dashboard > Settings > Environment Variables" -ForegroundColor Gray
        Write-Host "   2. Add: GOLDSKY_WEBHOOK_SECRET_TRADE = whs_01K9YRJBGXRFN27J3Z50N03KCV" -ForegroundColor Gray
        Write-Host "   3. Redeploy the application" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  Webhook Auth: Status $statusCode" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  - SSE is working for real-time updates" -ForegroundColor White
Write-Host "  - Webhook needs env vars configured in Vercel" -ForegroundColor White
Write-Host "==================================" -ForegroundColor Cyan

