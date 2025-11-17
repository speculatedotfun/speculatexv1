import { QueryClient } from '@tanstack/react-query';

export interface TradeDelta {
  id: string;
  marketId: number;
  txHash: string;
  timestamp: number;
  user: string;
  action: 'buy' | 'sell';
  side: 'yes' | 'no';
  tokenDelta: string;
  usdcDelta: string;
  priceE6: string;
}

export interface BalanceDelta {
  userId: string;
  side: 'yes' | 'no';
  balanceChange: bigint; // positive = increase, negative = decrease
}

export interface PriceDelta {
  newPrice: number;
  priceChange: number; // percentage change
  volumeChange: bigint;
}

export interface MarketDelta {
  marketId: number;
  trades?: TradeDelta[];
  balances?: BalanceDelta[];
  price?: PriceDelta;
  volume?: bigint;
  timestamp: number;
}

/**
 * Apply differential updates instead of full refetch
 */
export const applyMarketDelta = (
  queryClient: QueryClient,
  delta: MarketDelta
): void => {
  const queryKey = ['marketSnapshot', delta.marketId];

  queryClient.setQueryData(queryKey, (currentData: any) => {
    if (!currentData) return currentData;

    let updatedData = { ...currentData };

    // Apply trade updates
    if (delta.trades && delta.trades.length > 0) {
      const newTrades = delta.trades.map(trade => ({
        ...trade,
        user: { id: trade.user },
        action: trade.action,
        side: trade.side,
        tokenDelta: trade.tokenDelta,
        usdcDelta: trade.usdcDelta,
        priceE6: trade.priceE6,
      }));

      // Add new trades to the beginning of tradesDesc
      updatedData.tradesDesc = [
        ...newTrades,
        ...(updatedData.tradesDesc || [])
      ].slice(0, 200); // Keep only recent 200 trades

      // Update tradesAsc if within time range
      if (updatedData.tradesAsc) {
        const oldestAscTime = updatedData.tradesAsc[0]?.timestamp || 0;
        const newAscTrades = newTrades.filter(t => t.timestamp >= oldestAscTime);
        updatedData.tradesAsc = [
          ...(updatedData.tradesAsc || []),
          ...newAscTrades
        ].sort((a: any, b: any) => a.timestamp - b.timestamp);
      }
    }

    // Apply balance updates
    if (delta.balances && delta.balances.length > 0) {
      for (const balanceUpdate of delta.balances) {
        const balanceKey = balanceUpdate.side === 'yes' ? 'yesBalances' : 'noBalances';
        const balances = updatedData[balanceKey] || [];

        // Find existing balance for this user
        const existingIndex = balances.findIndex((b: any) =>
          b.user?.id === balanceUpdate.userId
        );

        if (existingIndex >= 0) {
          const currentBalance = BigInt(balances[existingIndex].tokenBalance || '0');
          const newBalance = currentBalance + balanceUpdate.balanceChange;

          if (newBalance <= 0n) {
            // Remove balance if zero or negative
            balances.splice(existingIndex, 1);
          } else {
            // Update balance
            balances[existingIndex] = {
              ...balances[existingIndex],
              tokenBalance: newBalance.toString(),
            };
          }
        } else if (balanceUpdate.balanceChange > 0n) {
          // Add new balance entry
          balances.push({
            user: { id: balanceUpdate.userId },
            tokenBalance: balanceUpdate.balanceChange.toString(),
          });
        }

        // Re-sort by balance (descending)
        balances.sort((a: any, b: any) =>
          BigInt(b.tokenBalance || '0') - BigInt(a.tokenBalance || '0')
        );

        updatedData[balanceKey] = balances;
      }
    }

    // Apply price updates
    if (delta.price) {
      updatedData.currentPrice = delta.price.newPrice;
      updatedData.priceChange24h = delta.price.priceChange;

      // Update latest trade price
      if (updatedData.tradesDesc?.[0]) {
        updatedData.tradesDesc[0].price = delta.price.newPrice;
      }
    }

    // Apply volume updates
    if (delta.volume !== undefined) {
      updatedData.totalVolume = (BigInt(updatedData.totalVolume || '0') + delta.volume).toString();
    }

    // Update last update timestamp
    updatedData.lastDeltaUpdate = delta.timestamp;

    return updatedData;
  });
};

/**
 * Batch multiple deltas for efficient processing
 */
export const applyBatchDeltas = (
  queryClient: QueryClient,
  deltas: MarketDelta[]
): void => {
  // Group deltas by market
  const marketGroups = new Map<number, MarketDelta[]>();

  for (const delta of deltas) {
    if (!marketGroups.has(delta.marketId)) {
      marketGroups.set(delta.marketId, []);
    }
    marketGroups.get(delta.marketId)!.push(delta);
  }

  // Apply deltas for each market
  for (const [marketId, marketDeltas] of marketGroups) {
    // Merge deltas for the same market
    const mergedDelta: MarketDelta = {
      marketId,
      timestamp: Math.max(...marketDeltas.map(d => d.timestamp)),
      trades: marketDeltas.flatMap(d => d.trades || []),
      balances: marketDeltas.flatMap(d => d.balances || []),
    };

    // Merge price updates (take the latest)
    const priceUpdates = marketDeltas
      .filter(d => d.price)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (priceUpdates.length > 0) {
      mergedDelta.price = priceUpdates[0].price;
    }

    // Sum volume changes
    const volumeChanges = marketDeltas
      .filter(d => d.volume !== undefined)
      .reduce((sum, d) => sum + (d.volume || 0n), 0n);

    if (volumeChanges !== 0n) {
      mergedDelta.volume = volumeChanges;
    }

    applyMarketDelta(queryClient, mergedDelta);
  }
};

/**
 * Convert webhook payload to delta format
 */
export const webhookToDelta = (webhookPayload: any): MarketDelta | null => {
  try {
    const payload = webhookPayload?.payload;
    if (!payload) return null;

    // Extract trade data (similar to existing handleWebhookTrade logic)
    const data = payload.data || payload.new || payload.record;
    if (!data) return null;

    const marketId = parseInt(data.marketId || data.market_id || data.market?.id);
    if (!marketId) return null;

    const trade: TradeDelta = {
      id: data.id || `${data.txHash || data.tx_hash}_${Date.now()}`,
      marketId,
      txHash: data.txHash || data.tx_hash || '',
      timestamp: parseInt(data.timestamp) || Date.now() / 1000,
      user: data.user?.id || data.user || data.account || data.trader || '',
      action: data.action || data.operation || 'buy',
      side: data.side || data.position || 'yes',
      tokenDelta: data.tokenDelta || data.token_delta || '0',
      usdcDelta: data.usdcDelta || data.usdc_delta || '0',
      priceE6: data.priceE6 || data.price_e6 || '0',
    };

    return {
      marketId,
      trades: [trade],
      timestamp: trade.timestamp,
    };
  } catch (error) {
    console.warn('[Delta] Failed to convert webhook to delta:', error);
    return null;
  }
};

/**
 * Check if differential updates should be used vs full refetch
 */
export const shouldUseDifferentialUpdate = (
  currentData: any,
  lastUpdateTime: number,
  maxAgeForDelta = 300_000 // 5 minutes
): boolean => {
  if (!currentData) return false;

  const timeSinceLastUpdate = Date.now() - (currentData.lastDeltaUpdate || 0);
  return timeSinceLastUpdate < maxAgeForDelta;
};



