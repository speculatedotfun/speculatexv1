#!/usr/bin/env pwsh

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Testing SSE Broadcast" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 1: Testing if broadcast endpoint works..." -ForegroundColor Yellow
Write-Host ""

$url = "https://speculate-veck.vercel.app/api/broadcast-trade"
$headers = @{
    "Content-Type" = "application/json"
}

$body = @{
    marketId = "2"
    newPriceYes = 0.75
    newPriceNo = 0.25
    newQYes = "1000000000000000000"
    newQNo = "500000000000000000"
    txHash = "0xtest_broadcast_$(Get-Random)"
} | ConvertTo-Json

Write-Host "Sending test broadcast..." -ForegroundColor Yellow
Write-Host "  Market ID: 2" -ForegroundColor Gray
Write-Host "  Price: 75% YES / 25% NO" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body -ErrorAction Stop
    
    if ($response.ok -eq $true) {
        Write-Host "✅ Broadcast endpoint is working!" -ForegroundColor Green
        Write-Host ""
        Write-Host "If you have market page open in a browser," -ForegroundColor Cyan
        Write-Host "you should see in the console:" -ForegroundColor Cyan
        Write-Host "  [MarketDetail] Cross-browser event detected (client-trade)" -ForegroundColor White
        Write-Host "  [MarketDetail] Dispatched chart update from SSE" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "⚠️  Unexpected response:" -ForegroundColor Yellow
        Write-Host $response -ForegroundColor White
    }
    
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "❌ Broadcast endpoint failed!" -ForegroundColor Red
    Write-Host "Status Code: $statusCode" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    
    if ($statusCode -eq 404) {
        Write-Host "The broadcast-trade endpoint doesn't exist yet." -ForegroundColor Yellow
        Write-Host "Make sure the deployment completed successfully." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

