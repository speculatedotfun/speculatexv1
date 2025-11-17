#!/usr/bin/env pwsh

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Testing Complete SSE + Webhook Flow" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "This test will:" -ForegroundColor Yellow
Write-Host "  1. Send a test trade webhook to Vercel" -ForegroundColor Gray
Write-Host "  2. The webhook should broadcast via SSE" -ForegroundColor Gray
Write-Host "  3. Any connected browsers should see the update" -ForegroundColor Gray
Write-Host ""

# Test data
$url = "https://speculate-veck.vercel.app/api/goldsky-webhook"
$secret = "whs_01K9YRJBGXRFN27J3Z50N03KCV"
$headers = @{
    "Content-Type" = "application/json"
    "goldsky-webhook-secret" = $secret
}

$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$txHash = "0xtest_$(Get-Random)"

$body = @{
    entity = @{
        __typename = "Trade"
        market = @{
            id = "2"
        }
        priceE6 = "650000"  # 65% YES price
        timestamp = $timestamp.ToString()
        txHash = $txHash
    }
} | ConvertTo-Json -Depth 10

Write-Host "Sending test trade webhook..." -ForegroundColor Yellow
Write-Host "  Market ID: 2" -ForegroundColor Gray
Write-Host "  YES Price: 65%" -ForegroundColor Gray
Write-Host "  NO Price: 35%" -ForegroundColor Gray
Write-Host "  TxHash: $txHash" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body
    
    if ($response.ok -eq $true) {
        Write-Host "✅ SUCCESS! Webhook was accepted and broadcast!" -ForegroundColor Green
        Write-Host ""
        Write-Host "What happened:" -ForegroundColor Cyan
        Write-Host "  1. ✅ Webhook received by Vercel" -ForegroundColor Green
        Write-Host "  2. ✅ Authentication passed" -ForegroundColor Green
        Write-Host "  3. ✅ Event broadcast to all SSE clients" -ForegroundColor Green
        Write-Host ""
        Write-Host "If you have the market page open:" -ForegroundColor Yellow
        Write-Host "  - The chart should update with the new price" -ForegroundColor White
        Write-Host "  - Price cards should show 65%/35%" -ForegroundColor White
        Write-Host "  - All browser tabs should sync" -ForegroundColor White
        Write-Host ""
        Write-Host "Open: https://speculate-veck.vercel.app/markets/2" -ForegroundColor Cyan
        Write-Host "      and watch for real-time updates!" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️  Unexpected response:" -ForegroundColor Yellow
        Write-Host $response -ForegroundColor White
    }
    
} catch {
    Write-Host "❌ Test failed!" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

