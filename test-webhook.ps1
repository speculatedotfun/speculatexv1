#!/usr/bin/env pwsh

Write-Host "Testing Goldsky Webhook" -ForegroundColor Cyan
Write-Host ""

$url = "https://speculate-veck.vercel.app/api/goldsky-webhook"
$secret = "whs_01K9YRJBGXRFN27J3Z50N03KCV"

$headers = @{
    "Content-Type" = "application/json"
    "goldsky-webhook-secret" = $secret
}

$body = @{
    entity = @{
        __typename = "Trade"
        market = @{
            id = "2"
        }
        priceE6 = "650000"
        timestamp = ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()).ToString()
        txHash = "0xtest_$(Get-Random)"
    }
} | ConvertTo-Json -Depth 10

Write-Host "Sending test webhook..." -ForegroundColor Yellow
Write-Host "URL: $url" -ForegroundColor Gray
Write-Host "Secret: $($secret.Substring(0,10))..." -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body
    
    if ($response.ok -eq $true) {
        Write-Host "✅ Webhook accepted!" -ForegroundColor Green
        Write-Host "Response: $($response | ConvertTo-Json)" -ForegroundColor White
        Write-Host ""
        Write-Host "If SSE clients are connected, they should receive this trade event!" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️  Unexpected response:" -ForegroundColor Yellow
        Write-Host $response -ForegroundColor White
    }
    
} catch {
    Write-Host "❌ Webhook failed!" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
}

