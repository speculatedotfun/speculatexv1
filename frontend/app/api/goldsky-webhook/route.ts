import { NextResponse } from 'next/server';

// Process Trade and Redemption events from Goldsky webhooks
function processEvents(payload: any): { tradeEvents: any[], redemptionEvents: any[] } {
  try {
    // Handle different webhook payload structures
    const events = Array.isArray(payload) ? payload : [payload];
    const tradeEvents: any[] = [];
    const redemptionEvents: any[] = [];

    for (const event of events) {
      // Check if this is a Trade entity update
      if (event.entity?.__typename === 'Trade' || event.data?.entity?.__typename === 'Trade') {
        const trade = event.entity || event.data?.entity;

        if (trade && trade.market && trade.priceE6 !== undefined) {
          // Convert price from E6 format (micro-units) to decimal
          const priceYes = Number(trade.priceE6) / 1e6;
          const priceNo = 1 - priceYes;

          // Convert market ID to string (BigInt can't be serialized in JSON)
          const marketIdStr = trade.market.id || trade.market;

          // Create chart update event data (same format as local trade events)
          const tradeEvent = {
            marketId: marketIdStr,
            newPriceYes: Math.max(0, Math.min(1, priceYes)),
            newPriceNo: Math.max(0, Math.min(1, priceNo)),
            timestamp: trade.timestamp ? Number(trade.timestamp) * 1000 : Date.now(),
            txHash: trade.txHash || `webhook-${Date.now()}`,
            source: 'goldsky-webhook'
          };

          tradeEvents.push(tradeEvent);

          console.log('[Goldsky webhook] Processed trade event for chart update:', {
            marketId: marketIdStr,
            priceYes,
            priceNo,
            timestamp: trade.timestamp,
            txHash: trade.txHash
          });
        }
      }

      // Check if this is a Redemption entity update
      if (event.entity?.__typename === 'Redemption' || event.data?.entity?.__typename === 'Redemption') {
        const redemption = event.entity || event.data?.entity;

        if (redemption && redemption.market && redemption.user && redemption.amount !== undefined) {
          // Convert market ID to string
          const marketIdStr = redemption.market.id || redemption.market;

          // Create redemption event data
          const redemptionEvent = {
            marketId: marketIdStr,
            user: redemption.user,
            amount: Number(redemption.amount) / 1e6, // Convert from micro-units to USDC
            timestamp: redemption.timestamp ? Number(redemption.timestamp) * 1000 : Date.now(),
            txHash: redemption.txHash || `webhook-${Date.now()}`,
            source: 'goldsky-webhook'
          };

          redemptionEvents.push(redemptionEvent);

          console.log('[Goldsky webhook] Processed redemption event:', {
            marketId: marketIdStr,
            user: redemption.user,
            amount: redemptionEvent.amount,
            txHash: redemption.txHash
          });
        }
      }
    }

    return { tradeEvents, redemptionEvents };
  } catch (error) {
    console.error('[Goldsky webhook] Failed to process events:', error);
    return { tradeEvents: [], redemptionEvents: [] };
  }
}

// Support multiple webhook secrets for different event types
const VALID_SECRETS = [
  process.env.GOLDSKY_WEBHOOK_SECRET_TRADE,
  process.env.GOLDSKY_WEBHOOK_SECRET_REDEMPTION,
  process.env.GOLDSKY_WEBHOOK_SECRET_MARKET,
  process.env.GOLDSKY_WEBHOOK_SECRET, // Legacy support
].filter(Boolean); // Remove undefined values

export async function POST(request: Request) {
  const reqId =
    request.headers.get('goldsky-request-id') ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log('[Goldsky webhook] Incoming request', {
    id: reqId,
    url: request.url,
    headers: {
      'content-type': request.headers.get('content-type'),
      'user-agent': request.headers.get('user-agent'),
      'goldsky-webhook-secret': request.headers.get('goldsky-webhook-secret')?.slice(0, 5) ?? null,
    },
  });

  if (VALID_SECRETS.length === 0) {
    console.error(
      '[Goldsky webhook] No webhook secrets configured. Set GOLDSKY_WEBHOOK_SECRET_* environment variables.',
    );
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const incomingSecret = request.headers.get('goldsky-webhook-secret');
  if (!incomingSecret || !VALID_SECRETS.includes(incomingSecret)) {
    console.warn('[Goldsky webhook] Unauthorized request: secret mismatch', {
      id: reqId,
      provided: incomingSecret?.slice(0, 10) + '...',
      validSecrets: VALID_SECRETS.map(s => s?.slice(0, 10) + '...'),
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    console.error('[Goldsky webhook] Failed to parse request body', { id: reqId, error });
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log('[Goldsky webhook] Received payload:', { id: reqId, payload });

  // Process Trade and Redemption events (for logging/analytics)
  const { tradeEvents, redemptionEvents } = processEvents(payload);

  // Events are now handled by blockchain event watchers in the frontend
  // No need to broadcast via SSE - clients watch blockchain events directly

  return NextResponse.json({ ok: true });
}

export function GET() {
  return NextResponse.json({ ok: true });
}

