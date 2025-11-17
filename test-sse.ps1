#!/usr/bin/env pwsh

Write-Host "Testing SSE Endpoint: https://speculate-veck.vercel.app/api/goldsky-stream" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop..." -ForegroundColor Yellow
Write-Host ""

try {
    # Create web request
    $url = "https://speculate-veck.vercel.app/api/goldsky-stream"
    $request = [System.Net.HttpWebRequest]::Create($url)
    $request.Method = "GET"
    $request.Accept = "text/event-stream"
    $request.KeepAlive = $true
    
    # Get response
    $response = $request.GetResponse()
    $stream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    
    Write-Host "✅ Connected to SSE endpoint!" -ForegroundColor Green
    Write-Host "Listening for events..." -ForegroundColor Cyan
    Write-Host ""
    
    $lineCount = 0
    $maxLines = 10  # Read first 10 events then stop
    
    while (-not $reader.EndOfStream -and $lineCount -lt $maxLines) {
        $line = $reader.ReadLine()
        if ($line) {
            Write-Host $line -ForegroundColor White
            $lineCount++
        }
    }
    
    Write-Host ""
    Write-Host "✅ SSE is working! Received $lineCount event lines." -ForegroundColor Green
    
} catch {
    Write-Host "❌ Failed to connect to SSE endpoint" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
} finally {
    if ($reader) { $reader.Close() }
    if ($stream) { $stream.Close() }
    if ($response) { $response.Close() }
}

