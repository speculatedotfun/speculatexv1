import { useState, useEffect, useCallback, useRef } from 'react';
import { useBlockNumber, useReadContract, usePublicClient } from 'wagmi';
import { addresses } from '@/lib/contracts';
import { coreAbi } from '@/lib/abis';
import { getSpotPriceYesE6 } from '@/lib/hooks';
import type { PricePoint } from '@/lib/priceHistory/types';

export interface MarketPrices {
  yes: number;
  no: number;
}

export interface InstantPrices {
  yes: number;
  no: number;
}

export interface MarketState {
  qYes: bigint;
  qNo: bigint;
  vault: bigint;
  b: bigint;
  priceYes: bigint;
}

export interface UseMarketDataResult {
  // Current prices
  currentPrices: MarketPrices;
  instantPrices: InstantPrices;

  // Chart data
  chartData: PricePoint[];

  // Market state
  marketState: MarketState | null;

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  refetch: () => Promise<void>;
}

export function useMarketData(marketId: number): UseMarketDataResult {
  const marketIdBigInt = BigInt(marketId);
  const publicClient = usePublicClient();
  const { data: blockNumber } = useBlockNumber({ watch: true });

  // State
  const [currentPrices, setCurrentPrices] = useState<MarketPrices>({ yes: 0.5, no: 0.5 });
  const [instantPrices, setInstantPrices] = useState<InstantPrices>({ yes: 0.5, no: 0.5 });
  const [chartData, setChartData] = useState<PricePoint[]>([]);
  const [marketState, setMarketState] = useState<MarketState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for polling
  const lastCheckedBlockRef = useRef<bigint | null>(null);
  const lastPriceUpdateTimeRef = useRef<number>(0);
  const lastEmittedPriceRef = useRef<number | null>(null);
  const processedTxHashesRef = useRef<Set<string>>(new Set());

  // Market state query
  const marketStateQuery = useReadContract({
    address: addresses.core,
    abi: coreAbi,
    functionName: 'getMarketState',
    args: [marketIdBigInt],
    query: { enabled: marketId > 0 },
  });

  // Load initial data
  const loadInitialData = useCallback(async () => {
    if (!publicClient || marketId <= 0) return;

    try {
      setIsLoading(true);
      setError(null);

      // Load market state
      const stateResult = await marketStateQuery.refetch();
      if (stateResult.data) {
        const [qYes, qNo, vault, b, priceYes] = stateResult.data as [bigint, bigint, bigint, bigint, bigint];
        setMarketState({ qYes, qNo, vault, b, priceYes });

        // Set initial prices
        const yesPrice = Number(priceYes) / 1e6;
        const noPrice = 1 - yesPrice;
        setCurrentPrices({ yes: yesPrice, no: noPrice });
        setInstantPrices({ yes: yesPrice, no: noPrice });
        lastEmittedPriceRef.current = yesPrice;
      }

    } catch (err) {
      console.error('[useMarketData] Failed to load initial data:', err);
      setError('Failed to load market data');
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, marketId]);

  // Block polling for price changes
  useEffect(() => {
    if (!blockNumber || !publicClient || marketId <= 0) return;

    // Check every block
    if (lastCheckedBlockRef.current && blockNumber - lastCheckedBlockRef.current < 1n) {
      return;
    }

    lastCheckedBlockRef.current = blockNumber;

    // Throttle updates
    const now = Date.now();
    if (now - lastPriceUpdateTimeRef.current < 2000) {
      return;
    }

    const pollPrices = async () => {
      try {
        const priceYesE6 = await getSpotPriceYesE6(marketIdBigInt);
        if (!priceYesE6) return;

        const newPriceYes = Number(priceYesE6) / 1e6;
        const newPriceNo = 1 - newPriceYes;

        // Only update if price changed significantly
        const previousYes = lastEmittedPriceRef.current ?? currentPrices.yes;
        const priceChange = Math.abs(previousYes - newPriceYes);
        if (priceChange > 0.00001) {
          console.log('[useMarketData] 📊 Price change detected:', {
            oldPrice: previousYes,
            newPrice: newPriceYes,
            change: priceChange
          });

          // Update current prices
          setCurrentPrices({ yes: newPriceYes, no: newPriceNo });
          setInstantPrices({ yes: newPriceYes, no: newPriceNo });
          lastEmittedPriceRef.current = newPriceYes;

          lastPriceUpdateTimeRef.current = now;
        }
      } catch (err) {
        console.error('[useMarketData] Polling error:', err);
      }
    };

    pollPrices();
  }, [blockNumber, publicClient, marketId]);

  // Load initial data on mount
  useEffect(() => {
    loadInitialData();
  }, []); // Empty dependency array - run only once on mount

  // Refetch function
  const refetch = useCallback(async () => {
    await loadInitialData();
  }, [loadInitialData]);

  return {
    currentPrices,
    instantPrices,
    chartData,
    marketState,
    isLoading,
    error,
    refetch,
  };
}
