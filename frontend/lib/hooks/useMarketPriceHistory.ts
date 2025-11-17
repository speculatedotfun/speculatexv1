import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { PricePoint } from '../priceHistory/types';
import { withSeedPoint } from '../marketUtils';
import type { SnapshotTrade, SnapshotTimeRange } from '../useMarketSnapshot';

declare global {
  interface Window {
    addEventListener(type: 'instant-trade-update', listener: (event: CustomEvent) => void): void;
    removeEventListener(type: 'instant-trade-update', listener: (event: CustomEvent) => void): void;
  }
}

export function useMarketPriceHistory(
  marketIdNum: number,
  timeRange: SnapshotTimeRange,
  snapshotData: any,
  historyLoading: boolean,
  marketCreatedAt?: bigint | number | string | null
) {

  const fallbackChartPointRef = useRef<PricePoint>({
    timestamp: Math.floor(Date.now() / 1000),
    priceYes: 0.5,
    priceNo: 0.5,
    txHash: 'seed',
  });

  // Update seed point timestamp from market createdAt when available
  // Priority: marketCreatedAt prop > snapshotData.createdAt > current time
  useEffect(() => {
    let createdAtTimestamp: number | null = null;
    
    // First check if createdAt was passed as prop (from blockchain event)
    if (marketCreatedAt !== null && marketCreatedAt !== undefined) {
      const num = typeof marketCreatedAt === 'bigint' 
        ? Number(marketCreatedAt) 
        : typeof marketCreatedAt === 'string'
          ? Number(marketCreatedAt)
          : marketCreatedAt;
      if (Number.isFinite(num) && num > 0) {
        createdAtTimestamp = num;
      }
    }
    
    // Fallback to snapshot data createdAt
    if (!createdAtTimestamp && snapshotData?.createdAt) {
      const num = Number(snapshotData.createdAt);
      if (!isNaN(num) && num > 0) {
        createdAtTimestamp = num;
      }
    }
    
    // Update seed point if we have a valid timestamp
    if (createdAtTimestamp && createdAtTimestamp > 0) {
      // Clamp createdAt to now in case of clock skew or future values
      const nowSec = Math.floor(Date.now() / 1000);
      if (createdAtTimestamp > nowSec) {
        createdAtTimestamp = nowSec;
      }
      fallbackChartPointRef.current = {
        timestamp: createdAtTimestamp,
        priceYes: 0.5,
        priceNo: 0.5,
        txHash: 'seed',
      };
      console.log('[useMarketPriceHistory] Updated seed point timestamp:', createdAtTimestamp);
    }
  }, [snapshotData?.createdAt, marketCreatedAt]);

  const [livePriceHistory, setLivePriceHistory] = useState<PricePoint[]>([
    fallbackChartPointRef.current,
  ]);

  // Track processed transaction hashes to prevent duplicate chart points
  const processedTxHashesRef = useRef<Set<string>>(new Set());

  // Track the last historical timestamp for continuity
  const lastHistoricalTimestampRef = useRef<number>(0);
  // Track the last live point timestamp to ensure uniqueness
  const lastLiveTimestampRef = useRef<number>(0);

  const priceHistoryStorageKey =
    typeof window !== 'undefined' && marketIdNum >= 0
      ? `priceHistory_v1_${window.location.origin}_${process.env.NEXT_PUBLIC_CHAIN_ID ?? 'unknown'}_${marketIdNum}_${timeRange}`
      : null;

  const sortedChartData = useMemo(() => {
    if (!livePriceHistory || livePriceHistory.length === 0) {
      // If no data, return seed point at market creation time (or current time)
      return [fallbackChartPointRef.current];
    }
    const sorted = [...livePriceHistory].sort((a, b) => a.timestamp - b.timestamp);
    
    // Remove duplicate timestamps (keep the latest point for each timestamp)
    // lightweight-charts requires strictly ascending timestamps
    const deduplicated: PricePoint[] = [];
    const timestampMap = new Map<number, PricePoint>();
    
    for (const point of sorted) {
      const existing = timestampMap.get(point.timestamp);
      // Keep the point with the most recent txHash (or the one we just added)
      if (!existing || (point.txHash && point.txHash > (existing.txHash || ''))) {
        timestampMap.set(point.timestamp, point);
      }
    }
    
    // Convert back to array and ensure strict ordering
    const final = Array.from(timestampMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    
    // Final safety check: ensure no duplicate timestamps
    const strictOrdered: PricePoint[] = [];
    let lastTimestamp = -1;
    for (const point of final) {
      if (point.timestamp > lastTimestamp) {
        strictOrdered.push(point);
        lastTimestamp = point.timestamp;
      } else if (point.timestamp === lastTimestamp) {
        // Replace with newer point if same timestamp
        strictOrdered[strictOrdered.length - 1] = point;
      }
    }
    
    return strictOrdered;
  }, [livePriceHistory]);

  const mergePricePoints = useCallback((points: PricePoint[]) => {
    if (!points || points.length === 0) return;
    setLivePriceHistory((prev: PricePoint[]) => {
      const dedup = new Map<string, PricePoint>();

      // Separate historical and live points
      const historicalPoints: PricePoint[] = [];
      const livePoints: PricePoint[] = [];

      const addPoints = (list: PricePoint[]) => {
        for (const point of list) {
          if (!point) continue;
          const key = `${point.txHash ?? 'unknown'}-${point.timestamp}-${point.priceYes.toFixed(6)}`;

          // Categorize points
          if (point.txHash?.startsWith('live-') || point.txHash === 'seed') {
            livePoints.push(point);
          } else {
            historicalPoints.push(point);
          }

          dedup.set(key, point);
        }
      };

      addPoints(prev);
      addPoints(points);

      const merged = Array.from(dedup.values()).sort((a, b) => a.timestamp - b.timestamp);

      // Update the last historical timestamp reference for continuity
      // Also track the highest live point timestamp
      if (merged.length > 0) {
        const lastPoint = merged[merged.length - 1];
        if (lastPoint.txHash && lastPoint.txHash !== 'seed' && !lastPoint.txHash.startsWith('live-')) {
          lastHistoricalTimestampRef.current = lastPoint.timestamp;
        }
        
        // Find the highest live point timestamp
        const livePoints = merged.filter(p => p.txHash?.startsWith('live-'));
        if (livePoints.length > 0) {
          const highestLiveTimestamp = Math.max(...livePoints.map(p => p.timestamp));
          if (highestLiveTimestamp > lastLiveTimestampRef.current) {
            lastLiveTimestampRef.current = highestLiveTimestamp;
          }
        }
      }

      return withSeedPoint(merged, fallbackChartPointRef.current);
    });
  }, []);

  // Load price history from snapshot data
  useEffect(() => {
    if (historyLoading) return;

    const snapshotPriceHistory =
      snapshotData?.tradesAsc
        ?.map<PricePoint | null>((trade: SnapshotTrade | null) => {
          if (
            !trade?.timestamp ||
            trade.priceE6 === null ||
            trade.priceE6 === undefined
          ) {
            return null;
          }
          const timestamp = Number(trade.timestamp);
          const priceYesValue = Number(trade.priceE6) / 1e6;
          if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(priceYesValue)) {
            return null;
          }
          return {
            timestamp,
            priceYes: Math.max(0, Math.min(1, priceYesValue)),
            priceNo: Math.max(0, Math.min(1, 1 - priceYesValue)),
            txHash: trade.txHash ?? undefined,
          };
        })
        .filter((point): point is PricePoint => point !== null) ?? [];

    // If no trades exist yet, use market createdAt timestamp for seed point
    if (snapshotPriceHistory.length === 0) {
      // Update seed point to market creation time if available
      // Priority: marketCreatedAt prop > snapshotData.createdAt > current time
      let createdAtTimestamp: number | null = null;
      
      if (marketCreatedAt !== null && marketCreatedAt !== undefined) {
        const num = typeof marketCreatedAt === 'bigint' 
          ? Number(marketCreatedAt) 
          : typeof marketCreatedAt === 'string'
            ? Number(marketCreatedAt)
            : marketCreatedAt;
        if (Number.isFinite(num) && num > 0) {
          createdAtTimestamp = num;
        }
      }
      
      if (!createdAtTimestamp && snapshotData?.createdAt) {
        const num = Number(snapshotData.createdAt);
        if (!isNaN(num) && num > 0) {
          createdAtTimestamp = num;
        }
      }
      
      if (createdAtTimestamp && createdAtTimestamp > 0) {
        const nowSec = Math.floor(Date.now() / 1000);
        if (createdAtTimestamp > nowSec) {
          createdAtTimestamp = nowSec;
        }
        fallbackChartPointRef.current = {
          timestamp: createdAtTimestamp,
          priceYes: 0.5,
          priceNo: 0.5,
          txHash: 'seed',
        };
        // Provide two points so the chart draws a visible segment
        setLivePriceHistory([
          fallbackChartPointRef.current,
          {
            timestamp: createdAtTimestamp + 1,
            priceYes: 0.5,
            priceNo: 0.5,
            txHash: 'seed-dup',
          },
        ]);
        console.log('[useMarketPriceHistory] Set seed point at market creation:', createdAtTimestamp);
      } else {
        // Fallback: use current timestamp if no createdAt available
        fallbackChartPointRef.current = {
          timestamp: Math.floor(Date.now() / 1000),
          priceYes: 0.5,
          priceNo: 0.5,
          txHash: 'seed',
        };
        const ts = fallbackChartPointRef.current.timestamp;
        setLivePriceHistory([
          fallbackChartPointRef.current,
          { timestamp: ts + 1, priceYes: 0.5, priceNo: 0.5, txHash: 'seed-dup' },
        ]);
      }
      return;
    }

    const earliest = snapshotPriceHistory.reduce(
      (min, point) => (point.timestamp < min ? point.timestamp : min),
      snapshotPriceHistory[0].timestamp
    );
    // Use market createdAt if available, otherwise use earliest trade minus 60 seconds
    const adjustedSeedTimestamp = snapshotData?.createdAt 
      ? Number(snapshotData.createdAt)
      : (earliest > 0 ? Math.max(0, earliest - 60) : 0);
    fallbackChartPointRef.current = {
      ...fallbackChartPointRef.current,
      timestamp: adjustedSeedTimestamp,
    };

    const dedup = new Map<string, PricePoint>();
    for (const point of snapshotPriceHistory) {
      const key = `${point.txHash ?? 'unknown'}-${point.timestamp.toString()}-${point.priceYes.toFixed(6)}`;
      dedup.set(key, point);
    }

    const sorted = Array.from(dedup.values()).sort((a, b) => a.timestamp - b.timestamp);

    // Track the last historical timestamp for live update continuity
    if (sorted.length > 0) {
      const lastHistoricalPoint = sorted[sorted.length - 1];
      lastHistoricalTimestampRef.current = lastHistoricalPoint.timestamp;
      // Initialize lastLiveTimestampRef to ensure new points are after historical data
      if (lastHistoricalPoint.timestamp > lastLiveTimestampRef.current) {
        lastLiveTimestampRef.current = lastHistoricalPoint.timestamp;
      }

      // Note: We no longer initialize last price since we use transaction hash deduplication
    }

    // Merge with existing live data to preserve live updates across time range changes
    setLivePriceHistory((prevData) => {
      // Separate existing live points from historical points
      const existingLivePoints = prevData.filter(point =>
        point.txHash?.startsWith('live-') || point.txHash === 'seed'
      );

      // Combine historical data with existing live points
      const combined = [...sorted, ...existingLivePoints];
      const mergedDedup = new Map<string, PricePoint>();

      for (const point of combined) {
        const key = `${point.txHash ?? 'unknown'}-${point.timestamp}-${point.priceYes.toFixed(6)}`;
        mergedDedup.set(key, point);
      }

      const merged = Array.from(mergedDedup.values()).sort((a, b) => a.timestamp - b.timestamp);
      return withSeedPoint(merged, fallbackChartPointRef.current);
    });
  }, [historyLoading, snapshotData?.tradesAsc, marketCreatedAt, snapshotData?.createdAt]);

  // Store refs for stable event handler
  const marketIdNumRef = useRef(marketIdNum);
  const mergePricePointsRef = useRef(mergePricePoints);
  
  // Update refs when values change (always keep latest)
  useEffect(() => {
    marketIdNumRef.current = marketIdNum;
    mergePricePointsRef.current = mergePricePoints;
  }, [marketIdNum, mergePricePoints]);

  // Clear processed transaction hashes when market changes
  useEffect(() => {
    processedTxHashesRef.current.clear();
  }, [marketIdNum]);

  // Listen for live trade updates and merge them into the history
  useEffect(() => {

    const handleInstantTradeUpdate = (event: any) => {
      // Always use latest refs
      const currentMarketIdNum = marketIdNumRef.current;
      const currentMergePricePoints = mergePricePointsRef.current;


      const detail = event.detail;
      if (!detail) {
        console.warn('[useMarketPriceHistory] Event has no detail', event);
        return;
      }

      const { marketId: eventMarketId, newPriceYes, newPriceNo } = detail;


      // Filter to only this market's updates
      let eventMarketIdNumber: number;
      if (typeof eventMarketId === 'bigint') {
        eventMarketIdNumber = Number(eventMarketId);
      } else if (typeof eventMarketId === 'string') {
        eventMarketIdNumber = parseInt(eventMarketId, 10);
      } else {
        eventMarketIdNumber = Number(eventMarketId);
      }
      
      // Handle NaN
      if (isNaN(eventMarketIdNumber)) {
        console.warn('[useMarketPriceHistory] Invalid marketId in event:', eventMarketId);
        return;
      }
      

      if (eventMarketIdNumber !== currentMarketIdNum) {
        return;
      }


      // Add new live data point
      if (typeof newPriceYes === 'number' && typeof newPriceNo === 'number') {
        const clampedPriceYes = Math.max(0, Math.min(1, newPriceYes));
        const clampedPriceNo = Math.max(0, Math.min(1, clampedPriceYes === 1 ? 0 : 1 - clampedPriceYes));

        // DEBUG: Log all incoming events to see what's happening
        console.log('[useMarketPriceHistory] 📥 CHART RECEIVED EVENT:', {
          txHash: detail.txHash || 'NO-TXHASH',
          source: detail.source || 'NO-SOURCE',
          priceYes: detail.newPriceYes,
          priceNo: detail.newPriceNo,
          marketId: detail.marketId,
          timestamp: detail.timestamp
        });

        // BLOCK OPTIMISTIC UPDATES: Only allow confirmed transactions (blockchain events or block polling)
        const isConfirmedTransaction = (detail.source === 'blockchain-event' || detail.source === 'block-fallback') && detail.txHash;

        if (!isConfirmedTransaction) {
          console.log('[useMarketPriceHistory] 🚫 Blocking update - not a confirmed transaction:', {
            txHash: detail.txHash || 'no-txHash',
            source: detail.source || 'no-source',
            reason: 'Only blockchain-event or block-fallback with txHash allowed'
          });
          return; // Only allow confirmed transactions to update the chart
        }

        console.log('[useMarketPriceHistory] ✅ Processing confirmed blockchain transaction:', {
          txHash: detail.txHash,
          source: detail.source
        });

        // Simple transaction hash deduplication (only confirmed transactions reach here)
        const txHash = detail.txHash;
        if (processedTxHashesRef.current.has(txHash)) {
          console.log('[useMarketPriceHistory] Transaction already processed:', txHash);
          return;
        }

        // Mark this confirmed transaction as processed
        processedTxHashesRef.current.add(txHash);
        console.log('[useMarketPriceHistory] ✅ Processing confirmed transaction:', txHash);

        // Ensure unique, strictly increasing timestamp
        // Use millisecond precision to avoid collisions
        const currentTimeMs = Date.now();
        const currentTimeSec = Math.floor(currentTimeMs / 1000);
        const minTimestamp = Math.max(
          lastHistoricalTimestampRef.current,
          currentTimeSec
        );

        // Always increment from lastLiveTimestampRef to ensure strict ordering
        // Add 1 to guarantee it's strictly greater than the last one
        let newTimestamp = Math.max(
          lastLiveTimestampRef.current + 1,
          minTimestamp
        );

        // If we're still at the same second, increment further
        if (newTimestamp <= lastLiveTimestampRef.current) {
          newTimestamp = lastLiveTimestampRef.current + 1;
        }

        lastLiveTimestampRef.current = newTimestamp;

        const newPoint: PricePoint = {
          timestamp: newTimestamp,
          priceYes: clampedPriceYes,
          priceNo: clampedPriceNo,
          txHash: txHash || `live-${Date.now()}`,
        };

        console.log('[useMarketPriceHistory] Creating chart point:', {
          txHash: txHash || 'price-update',
          priceYes: clampedPriceYes,
          priceNo: clampedPriceNo,
          timestamp: newTimestamp
        });

        // Merge this live point into the history
        currentMergePricePoints([newPoint]);
      } else {
        console.warn('[useMarketPriceHistory] Invalid price data:', { newPriceYes, newPriceNo });
      }
    };

    // Register listener - will use refs to get latest values
    window.addEventListener('instant-trade-update', handleInstantTradeUpdate);

    return () => {
      window.removeEventListener('instant-trade-update', handleInstantTradeUpdate);
    };
  }, [marketIdNum]); // Re-register when marketId changes

  // Load from localStorage - TEMPORARILY DISABLED FOR TESTING
  useEffect(() => {
    // DISABLED: Comment out the entire localStorage loading logic
    /*
    if (!priceHistoryStorageKey || typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(priceHistoryStorageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;

      const sanitized = parsed
        .map((point: any): PricePoint | null => {
          if (!point) return null;
          const timestamp = Number(point.timestamp);
          const priceYesVal = Number(point.priceYes);
          const priceNoVal = Number(point.priceNo);
          if (
            !Number.isFinite(timestamp) ||
            !Number.isFinite(priceYesVal) ||
            !Number.isFinite(priceNoVal)
          ) {
            return null;
          }
          const txHash = typeof point.txHash === 'string' ? point.txHash : undefined;
          return {
            timestamp,
            priceYes: Math.max(0, Math.min(1, priceYesVal)),
            priceNo: Math.max(0, Math.min(1, priceNoVal)),
            ...(txHash ? { txHash } : {}),
          };
        })
        .filter((point): point is PricePoint => point !== null);

      if (sanitized.length === 0) return;
      setLivePriceHistory(withSeedPoint(sanitized, fallbackChartPointRef.current));
    } catch (error) {
      console.warn('[useMarketPriceHistory] Failed to restore cache', error);
    }
    */
  }, [priceHistoryStorageKey]);

  // Save to localStorage
  useEffect(() => {
    if (!priceHistoryStorageKey || typeof window === 'undefined') return;
    if (!livePriceHistory || livePriceHistory.length === 0) return;
    try {
      window.localStorage.setItem(priceHistoryStorageKey, JSON.stringify(livePriceHistory));
    } catch (error) {
      console.warn('[useMarketPriceHistory] Failed to persist cache', error);
    }
  }, [priceHistoryStorageKey, livePriceHistory]);

  return {
    livePriceHistory,
    sortedChartData,
    mergePricePoints,
    fallbackChartPointRef,
    lastHistoricalTimestampRef,
  };
}

