'use client';
// @ts-nocheck
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useReadContract, usePublicClient } from 'wagmi';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { formatUnits } from 'viem';
import { useQueryClient } from '@tanstack/react-query';

// Components
import Header from '@/components/Header';
import TradingCard from '@/components/TradingCard';
import { PriceChart } from '@/components/PriceChart';
import { MarketHeader } from '@/components/market/MarketHeader';

// Lib
import { getMarket, getSpotPriceYesE6, getMarketResolution, getMarketState } from '@/lib/hooks';
import { addresses } from '@/lib/contracts';
import { positionTokenAbi, coreAbi } from '@/lib/abis';
import { formatPriceInCents, getAssetLogo } from '@/lib/marketUtils';
import type { PricePoint } from '@/lib/priceHistory/types';
import {
  useMarketSnapshot,
  type SnapshotTimeRange,
  type SnapshotTrade,
  getSecondsForRange,
} from '@/lib/useMarketSnapshot';
import { subscribeToSubgraph } from '@/lib/subgraphClient';
import type { TransactionRow, Holder } from '@/lib/marketTransformers';
import { toTransactionRow, toHolder } from '@/lib/marketTransformers';

// Custom Hooks
import { useMarketPriceHistory } from '@/lib/hooks/useMarketPriceHistory';
import { useMarketTransactions } from '@/lib/hooks/useMarketTransactions';
import { useMarketHolders } from '@/lib/hooks/useMarketHolders';

// Tabs
import { PositionTab } from './tabs/PositionTab';
import { CommentsTab } from './tabs/CommentsTab';
import { TransactionsTab } from './tabs/TransactionsTab';
import { ResolutionTab } from './tabs/ResolutionTab';
import { TopHoldersCard } from './components/TopHoldersCard';

const SNAPSHOT_TRADE_LIMIT = 200;
const SNAPSHOT_HOLDER_LIMIT = 20;

const MARKET_LIVE_SUBSCRIPTION = /* GraphQL */ `
  subscription MarketLive(
    $id: ID!
    $since: BigInt!
    $txLimit: Int!
    $holderLimit: Int!
  ) {
    market(id: $id) {
      id
      createdAt
      tradesAsc: trades(
        where: { timestamp_gte: $since }
        orderBy: timestamp
        orderDirection: asc
        first: 1000
      ) {
        txHash
        timestamp
        user { id }
        action
        side
        tokenDelta
        usdcDelta
        priceE6
      }
      tradesDesc: trades(
        orderBy: timestamp
        orderDirection: desc
        first: $txLimit
      ) {
        txHash
        timestamp
        user { id }
        action
        side
        tokenDelta
        usdcDelta
        priceE6
      }
      yesBalances: positionBalances(
        where: { side: "yes", tokenBalance_gt: "0" }
        orderBy: tokenBalance
        orderDirection: desc
        first: $holderLimit
      ) {
        user { id }
        tokenBalance
      }
      noBalances: positionBalances(
        where: { side: "no", tokenBalance_gt: "0" }
        orderBy: tokenBalance
        orderDirection: desc
        first: $holderLimit
      ) {
        user { id }
        tokenBalance
      }
    }
  }
`;

export default function MarketDetailPage() {
  const params = useParams();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const rawIdParam = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const marketId = typeof rawIdParam === 'string' ? rawIdParam : '';
  const marketIdNum = Number(marketId);
  const isMarketIdValid = marketId !== '' && Number.isInteger(marketIdNum) && marketIdNum >= 0;
  const { address, isConnected } = useAccount();

  // Core market state
  const [market, setMarket] = useState<any>(null);
  const [priceYes, setPriceYes] = useState<number>(0.5);
  const [priceNo, setPriceNo] = useState<number>(0.5);
  const [resolution, setResolution] = useState<any>(null);
  const [marketState, setMarketState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // UI state
  const [activeTab, setActiveTab] = useState<'Position' | 'Comments' | 'Transactions' | 'Resolution'>('Resolution');
  const [holderTab, setHolderTab] = useState<'yes' | 'no'>('yes');
  const [chartSide, setChartSide] = useState<'yes' | 'no'>('yes');
  const [timeRange, setTimeRange] = useState<SnapshotTimeRange>('ALL');
  const [yesBalance, setYesBalance] = useState<string>('0');
  const [noBalance, setNoBalance] = useState<string>('0');
  const [logoSrc, setLogoSrc] = useState<string>(() => getAssetLogo());

  // Snapshot query
  const snapshotQuery = useMarketSnapshot(
    isMarketIdValid ? marketIdNum : null,
    timeRange,
    SNAPSHOT_TRADE_LIMIT,
    SNAPSHOT_HOLDER_LIMIT,
  );
  const snapshotData = snapshotQuery.data ?? null;
  const snapshotLoading = snapshotQuery.isLoading;

  // Custom hooks for data management
  const {
    livePriceHistory,
    sortedChartData,
    mergePricePoints,
  } = useMarketPriceHistory(
    marketIdNum,
    timeRange,
    snapshotData,
    snapshotLoading,
    market?.createdAt // Pass market createdAt from blockchain event (available immediately)
  );

  const {
    transactions,
    mergeTransactionRows,
  } = useMarketTransactions(marketIdNum, snapshotData);

  const {
    topHoldersYes,
    topHoldersNo,
  } = useMarketHolders(snapshotData, priceYes, priceNo);

  // Clear error when marketId changes
  useEffect(() => {
    setError('');
  }, [marketId]);

  // Listen for instant trade updates
  useEffect(() => {
    const handleInstantTradeUpdate = (event: any) => {
      const detail = event.detail;
      if (detail.marketId !== marketIdNum) return;

      // Update prices
      if (typeof detail.newPriceYes === 'number' && typeof detail.newPriceNo === 'number') {
        const newPriceYes = Math.max(0, Math.min(1, detail.newPriceYes));
        const newPriceNo = Math.max(0, Math.min(1, detail.newPriceNo));
        setPriceYes(newPriceYes);
        setPriceNo(newPriceNo);
      }

      // Update market state
      if (detail.newQYes && detail.newQNo) {
        setMarketState((prev: any) => {
          if (!prev) return prev;
          const updated = [...prev];
          updated[0] = detail.newQYes;
          updated[1] = detail.newQNo;
          if (detail.vaultIncrease) {
            updated[2] = (prev[2] || 0n) + detail.vaultIncrease;
          } else if (detail.vaultDecrease) {
            updated[2] = (prev[2] || 0n) - detail.vaultDecrease;
          }
          return updated;
        });
      }

      // Trigger brief refetch
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: ['marketSnapshot', marketIdNum],
          exact: false,
        });
      }, 100);
    };

    window.addEventListener('instant-trade-update', handleInstantTradeUpdate as any);
    return () => {
      window.removeEventListener('instant-trade-update', handleInstantTradeUpdate as any);
    };
  }, [marketIdNum, queryClient]);

  // Load market data
  const loadMarket = useCallback(async () => {
    if (!isMarketIdValid) {
      setLoading(false);
      return;
    }
    try {
      const marketIdBigInt = BigInt(marketIdNum);
      const onchainData = await getMarket(marketIdBigInt);

      if (!onchainData.yes || onchainData.yes === '0x0000000000000000000000000000000000000000') {
        setError('Market does not exist');
        setLoading(false);
        return;
      }

      const [yesPriceRaw, resolutionData, stateData] = await Promise.all([
        getSpotPriceYesE6(marketIdBigInt),
        getMarketResolution(marketIdBigInt),
        getMarketState(marketIdBigInt),
      ]);

      const yesPriceNum = Number(yesPriceRaw) / 1e6;
      const yesPriceClean = Number.isFinite(yesPriceNum) ? yesPriceNum : 0;
      const noPriceClean = Number.isFinite(yesPriceNum) ? Math.max(0, 1 - yesPriceNum) : 0;

      setMarket(onchainData);
      setPriceYes(yesPriceClean);
      setPriceNo(noPriceClean);
      setResolution(resolutionData);
      setMarketState(stateData);
    } catch (error) {
      console.error('Error loading market:', error);
    } finally {
      setLoading(false);
    }
  }, [isMarketIdValid, marketIdNum]);

  // Set logo when market loads
  useEffect(() => {
    if (market?.question) {
      setLogoSrc(getAssetLogo(String(market.question)));
    }
  }, [market?.question]);

  // Load market on mount
  useEffect(() => {
    if (!isMarketIdValid) return;
    loadMarket();
  }, [isMarketIdValid, loadMarket]);

  // Subscription payload
  const subscriptionPayload = useMemo(() => {
    if (!isMarketIdValid) return null;
    const secondsRange = getSecondsForRange(timeRange);
    const since =
      secondsRange !== null
        ? Math.max(0, Math.floor(Date.now() / 1000) - secondsRange)
        : 0;
    return {
      query: MARKET_LIVE_SUBSCRIPTION,
      variables: {
        id: marketIdNum.toString(),
        since: since.toString(),
        txLimit: SNAPSHOT_TRADE_LIMIT,
        holderLimit: SNAPSHOT_HOLDER_LIMIT,
      },
    };
  }, [isMarketIdValid, marketIdNum, timeRange]);

  // Process snapshot data when it arrives
  const processSnapshotData = useCallback(
    (snapshot: any) => {
      if (!snapshot) return;

      // Update latest price
      const tradesAsc = snapshot.tradesAsc ?? [];
      if (tradesAsc.length > 0) {
        const latestTrade = tradesAsc[tradesAsc.length - 1];
        if (latestTrade?.priceE6) {
          const priceYesValue = Number(latestTrade.priceE6) / 1e6;
          setPriceYes(Math.max(0, Math.min(1, priceYesValue)));
          setPriceNo(Math.max(0, Math.min(1, 1 - priceYesValue)));
        }
      }

      // Update createdAt if available
      if (snapshot.createdAt) {
        try {
          const createdAtBigInt = BigInt(snapshot.createdAt);
          setMarket((prev: any) => {
            if (!prev) return prev;
            if (typeof prev.createdAt === 'bigint' && prev.createdAt === createdAtBigInt) {
              return prev;
            }
            return { ...prev, createdAt: createdAtBigInt };
          });
        } catch (error) {
          console.warn('Failed to parse createdAt', error);
        }
      }
    },
    []
  );

  // Subscribe to live updates
  useEffect(() => {
    if (!subscriptionPayload) return;
    let disposed = false;

    const unsubscribe = subscribeToSubgraph<{ market: any }>(
      subscriptionPayload,
      {
        onData: payload => {
          if (disposed) return;
          processSnapshotData(payload.market ?? null);
        },
        onError: error => {
          console.error('[MarketDetail] Live subscription error', error);
        },
      },
    );

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [subscriptionPayload, processSnapshotData]);

  // Get user balances
  const { data: yesBal } = useReadContract({
    address: market?.yes as `0x${string}` | undefined,
    abi: positionTokenAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!(address && market?.yes),
    },
  });

  const { data: noBal } = useReadContract({
    address: market?.no as `0x${string}` | undefined,
    abi: positionTokenAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!(address && market?.no),
    },
  });

  useEffect(() => {
    if (yesBal) {
      setYesBalance(formatUnits(yesBal as bigint, 18));
    }
    if (noBal) {
      setNoBalance(formatUnits(noBal as bigint, 18));
    }
  }, [yesBal, noBal]);

  // Calculate percentage change
  const currentPrice = chartSide === 'yes' ? priceYes : priceNo;
  let chanceChangePercent = 0;
  if (sortedChartData.length > 0) {
    const firstPrice = chartSide === 'yes' ? sortedChartData[0].priceYes : sortedChartData[0].priceNo;
    if (firstPrice > 0) {
      chanceChangePercent = ((currentPrice - firstPrice) / firstPrice) * 100;
    }
  }

  // Resolved chart data (snap to 0 or 1 when resolved)
  const resolvedChartData = useMemo(() => {
    if (!sortedChartData.length || !market?.resolution?.isResolved) {
      return sortedChartData;
    }

    const yesWins = Boolean(market.resolution.yesWins);
    const lastPoint = sortedChartData[sortedChartData.length - 1];
    const finalTimestamp = (lastPoint?.timestamp ?? Math.floor(Date.now() / 1000)) + 1;
    const snapPoint: PricePoint = {
      timestamp: finalTimestamp,
      priceYes: yesWins ? 1 : 0,
      priceNo: yesWins ? 0 : 1,
      txHash: 'resolution-snap',
    };
    const alreadySnapped =
      Math.abs(lastPoint.priceYes - snapPoint.priceYes) < 1e-6 &&
      Math.abs(lastPoint.priceNo - snapPoint.priceNo) < 1e-6;
    if (alreadySnapped) {
      return sortedChartData;
    }
    return [...sortedChartData, snapPoint];
  }, [sortedChartData, market?.resolution?.isResolved, market?.resolution?.yesWins]);

  // Market status
  const totalVolume = marketState ? Number(formatUnits(marketState.vault ?? 0n, 6)) : 0;
  const createdAtDate = (() => {
    if (!market?.createdAt) return null;
    try {
      const numeric = typeof market.createdAt === 'bigint'
        ? Number(market.createdAt)
        : Number(market.createdAt);
      if (!Number.isFinite(numeric) || numeric <= 0) return null;
      return new Date(numeric * 1000);
    } catch {
      return null;
    }
  })();

  const marketStatus = typeof market?.status === 'number' ? market.status : Number(market?.status ?? 0);
  const marketResolution = market?.resolution;
  const marketExpiry = marketResolution?.expiryTimestamp ? Number(marketResolution.expiryTimestamp) : 0;
  const marketIsResolved = Boolean(marketResolution?.isResolved);
  const marketIsExpired = marketExpiry > 0 && marketExpiry < Date.now() / 1000;
  const marketIsActive = marketStatus === 0 && !marketIsResolved && !marketIsExpired;

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9FF] relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#14B8A6]/20 to-purple-400/20 rounded-full blur-3xl"
            animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
            transition={{ duration: 20, repeat: Infinity }}
          />
        </div>
        <Header />
        <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] sm:min-h-[calc(100vh-5rem)]">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 border-4 border-[#14B8A6] border-t-transparent rounded-full"
          />
          <p className="mt-6 text-lg font-semibold text-gray-600 text-center">Loading market...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#FAF9FF]">
        <Header />
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] sm:min-h-[calc(100vh-5rem)]">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Market Not Found</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link href="/markets" className="inline-flex items-center px-4 py-2 bg-[#14B8A6] text-white rounded-lg hover:bg-[#14B8A6]/90 transition-colors">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Browse Markets
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Invalid market ID
  if (!isMarketIdValid) {
    return (
      <div className="min-h-screen bg-[#FAF9FF]">
        <Header />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center bg-white rounded-2xl p-12 shadow-xl"
          >
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Market Not Found</h2>
            <p className="text-gray-600 mb-6">The market you&apos;re looking for doesn&apos;t exist.</p>
            <Link
              href="/markets"
              className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white font-bold rounded-lg hover:shadow-lg transition-all"
            >
              Back to Markets
            </Link>
          </motion.div>
        </div>
      </div>
    );
  }

  // Main content
  return (
    <div className="min-h-screen bg-[#FAF9FF] relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-[#14B8A6]/20 to-purple-400/20 rounded-full blur-3xl"
          animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
          transition={{ duration: 20, repeat: Infinity }}
        />
        <motion.div
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-[#14B8A6]/20 rounded-full blur-3xl"
          animate={{ scale: [1, 1.1, 1], rotate: [0, -90, 0] }}
          transition={{ duration: 25, repeat: Infinity, delay: 2 }}
        />
      </div>
      <Header />
   
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        {/* Back Link */}
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
        >
          <Link href="/markets" className="inline-flex items-center text-[#14B8A6] hover:text-[#0D9488] mb-6 font-semibold group">
            <motion.svg
              className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </motion.svg>
            BACK TO MARKETS
          </Link>
        </motion.div>

        {/* Market Header */}
        <MarketHeader
          market={market}
          resolution={resolution}
          totalVolume={totalVolume}
          createdAtDate={createdAtDate}
          logoSrc={logoSrc}
          marketIsActive={marketIsActive}
          onLogoError={() => setLogoSrc('/logos/default.png')}
        />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6 md:space-y-8">
            {/* Trading Card - Mobile */}
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="lg:hidden bg-white rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-100"
            >
              {isMarketIdValid && market && (
                <>
                  <TradingCard marketId={marketIdNum} />
                  {!marketIsActive && (
                    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      Trading for this market is closed.
                      {marketIsResolved
                        ? ' The market has been resolved.'
                        : marketIsExpired
                          ? ' The market has expired.'
                          : ' Trading is currently unavailable.'}
                    </div>
                  )}
                </>
              )}
            </motion.div>

            {/* Chart Card */}
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 md:p-8 shadow-xl border border-gray-100"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 md:mb-8 gap-4">
                <div className="flex-1">
                  <div className="text-xs sm:text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Market Price ({chartSide.toUpperCase()})</div>
                  <div className="flex items-baseline gap-2 sm:gap-4 flex-wrap">
                    <motion.div
                      key={chartSide === 'yes' ? priceYes : priceNo}
                      initial={{ scale: 1.2, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black bg-clip-text text-transparent ${
                        chartSide === 'yes'
                          ? 'bg-gradient-to-r from-green-500 to-green-600'
                          : 'bg-gradient-to-r from-red-500 to-red-600'
                      }`}
                    >
                      {formatPriceInCents(chartSide === 'yes' ? priceYes : priceNo)}
                    </motion.div>
                    <motion.div
                      key={chanceChangePercent}
                      initial={{ x: -10, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className={`flex items-center text-base sm:text-lg md:text-xl font-bold ${chanceChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {chanceChangePercent >= 0 ? '↑' : '↓'} {Math.abs(chanceChangePercent).toFixed(2)}%
                    </motion.div>
                  </div>
                </div>
                <div className="flex gap-2 sm:gap-3">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setChartSide('yes')}
                    className={`px-4 sm:px-6 md:px-8 py-3 sm:py-4 rounded-xl font-bold transition-all shadow-lg relative text-sm sm:text-base ${
                      chartSide === 'yes'
                        ? 'bg-gradient-to-r from-green-400 to-green-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <span>YES</span>
                      <span className={`text-xs mt-1 ${chartSide === 'yes' ? 'text-white/80' : 'text-gray-500'}`}>
                        {formatPriceInCents(priceYes)}
                      </span>
                    </div>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setChartSide('no')}
                    className={`px-4 sm:px-6 md:px-8 py-3 sm:py-4 rounded-xl font-bold transition-all shadow-lg relative text-sm sm:text-base ${
                      chartSide === 'no'
                        ? 'bg-gradient-to-r from-red-400 to-red-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <span>NO</span>
                      <span className={`text-xs mt-1 ${chartSide === 'no' ? 'text-white/80' : 'text-gray-500'}`}>
                        {formatPriceInCents(priceNo)}
                      </span>
                    </div>
                  </motion.button>
                </div>
              </div>

              {/* Chart */}
              <div className="mb-4 sm:mb-6">
                <div className="h-64 sm:h-80 md:h-96 bg-white rounded-xl border border-gray-200 p-2 sm:p-4 relative overflow-hidden flex items-center justify-center">
                  {snapshotLoading && sortedChartData.length === 0 ? (
                    <div className="flex items-center justify-center h-full w-full">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-12 h-12 border-4 border-[#14B8A6] border-t-transparent rounded-full"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full">
                      <PriceChart data={resolvedChartData} selectedSide={chartSide} marketId={marketIdNum} />
                    </div>
                  )}
                </div>
              </div>

              {/* Time Range Filters */}
              <div className="flex gap-3">
                {(['1D', '1W', '1M', 'ALL'] as const).map((range, index) => (
                  <motion.button
                    key={range}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.4 + index * 0.05 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setTimeRange(range)}
                    className={`flex-1 px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-md ${
                      timeRange === range
                        ? 'bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border-2 border-gray-200'
                    }`}
                  >
                    {range}
                  </motion.button>
                ))}
              </div>
            </motion.div>

            {/* Tabs Section */}
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="bg-white rounded-2xl p-4 sm:p-6 md:p-8 shadow-xl border border-gray-100"
            >
              <div className="flex gap-1 sm:gap-2 mb-6 sm:mb-8 bg-gray-50 rounded-xl p-1 sm:p-2 overflow-x-auto">
                {(['Position', 'Comments', 'Transactions', 'Resolution'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`relative flex-1 px-3 sm:px-4 md:px-6 py-2 sm:py-3 font-bold text-xs sm:text-sm transition-all rounded-lg whitespace-nowrap min-w-0 ${
                      activeTab === tab
                        ? 'text-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {activeTab === tab && (
                      <motion.div
                        layoutId="activeTabIndicator"
                        className="absolute inset-0 bg-gradient-to-r from-[#14B8A6] to-[#0D9488] rounded-lg shadow-lg"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-10">{tab}</span>
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  {activeTab === 'Position' && (
                    <PositionTab
                      isConnected={isConnected}
                      yesBalance={yesBalance}
                      noBalance={noBalance}
                      priceYes={priceYes}
                      priceNo={priceNo}
                    />
                  )}
                  {activeTab === 'Comments' && (
                    <CommentsTab
                      marketId={marketId}
                      isConnected={isConnected}
                      address={address}
                    />
                  )}
                  {activeTab === 'Transactions' && (
                    <TransactionsTab
                      transactions={transactions}
                      loading={snapshotLoading && transactions.length === 0}
                    />
                  )}
                  {activeTab === 'Resolution' && (
                    <ResolutionTab resolution={resolution} />
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-1 space-y-4 sm:space-y-6 md:space-y-8">
            {/* Trading Card - Desktop */}
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="hidden lg:block bg-white rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-100"
            >
              {isMarketIdValid && market && (
                <>
                  <TradingCard marketId={marketIdNum} />
                  {!marketIsActive && (
                    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      Trading for this market is closed.
                    </div>
                  )}
                </>
              )}
            </motion.div>

            {/* Top Holders */}
            <TopHoldersCard
              holderTab={holderTab}
              setHolderTab={setHolderTab}
              topHoldersYes={topHoldersYes}
              topHoldersNo={topHoldersNo}
              address={address}
              yesBalance={yesBalance}
              noBalance={noBalance}
              priceYes={priceYes}
              priceNo={priceNo}
            />
          </div>
        </div>
      </div>
    </div>
  );
}




