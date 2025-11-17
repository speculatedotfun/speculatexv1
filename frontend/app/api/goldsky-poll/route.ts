import { NextRequest, NextResponse } from 'next/server';

// Simple polling endpoint that returns current market data
// Note: Real-time updates are now handled via blockchain event watchers

// Rate limiting to prevent excessive polling
let lastRequestTime = 0;
const MIN_INTERVAL = 1000; // 1 second minimum between requests

export async function GET(request: NextRequest) {
  const now = Date.now();

  // Rate limit: prevent requests more frequent than 1 per second
  if (now - lastRequestTime < MIN_INTERVAL) {
    return NextResponse.json(
      { error: 'Rate limited', nextAllowed: lastRequestTime + MIN_INTERVAL },
      { status: 429 }
    );
  }

  lastRequestTime = now;

  // Log the request source for debugging excessive polling
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const referer = request.headers.get('referer') || 'unknown';
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown';

  console.log(`[Goldsky Poll] Request from ${ip}, UA: ${userAgent.substring(0, 50)}..., Referer: ${referer}`);

  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get('marketId');

    // For now, return a simple heartbeat
    // In production, this would query your subgraph for latest data
    const data = {
      timestamp: Date.now(),
      type: 'heartbeat',
      marketId: marketId || 'all',
      status: 'ok'
    };

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('[Goldsky Poll] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}



