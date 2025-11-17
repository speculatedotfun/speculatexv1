'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { SearchIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react';
import Header from '@/components/Header';
import { Badge, Button, Card, CardContent, Input } from '@/components/ui';
import { getMarketCount, getMarket, getPriceYes, getMarketResolution, getMarketState } from '@/lib/hooks';
import { formatUnits } from 'viem';
import { usePublicClient, useReadContract } from 'wagmi';
import { addresses } from '@/lib/contracts';
import { coreAbi, usdcAbi } from '@/lib/abis';
import { useQuery } from '@tanstack/react-query';
import { fetchSubgraph } from '@/lib/subgraphClient';

// Helper function to format price in cents
const formatPriceInCents = (price: number): string => {
  const cents = price * 100;
  if (cents >= 100) {
    return `$${cents.toFixed(2)}`;
  }
  const formatted = cents.toFixed(1).replace(/\.0$/, '');
  return `${formatted}¢`;
};

// Helper function to format time remaining until expiry
const formatTimeRemaining = (expiryTimestamp: bigint): string => {
  if (expiryTimestamp === 0n) return 'N/A';
  
  const now = Math.floor(Date.now() / 1000);
  const expiry = Number(expiryTimestamp);
  const secondsRemaining = expiry - now;
  
  if (secondsRemaining <= 0) return 'Expired';
  
  const days = Math.floor(secondsRemaining / 86400);
  const hours = Math.floor((secondsRemaining % 86400) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  
  if (days > 0) {
    return `${days}D ${hours}H`;
  } else if (hours > 0) {
    return `${hours}H ${minutes}M`;
  } else {
    return `${minutes}M`;
  }
};

// Helper function to format total duration (from creation to expiry)
const formatDuration = (expiryTimestamp: bigint): string => {
  if (expiryTimestamp === 0n) return 'N/A';
  
  // For now, we'll calculate from current time as we don't have creation timestamp
  // This will be approximate but better than random numbers
  const now = Math.floor(Date.now() / 1000);
  const expiry = Number(expiryTimestamp);
  const totalSeconds = expiry - now;
  
  if (totalSeconds <= 0) return 'Expired';
  
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  
  if (days > 0) {
    return `${days}D ${hours}H`;
  } else {
    return `${hours}H`;
  }
};

// Helper function to get resolution type label
const getResolutionTypeLabel = (oracleType: number): string => {
  switch (oracleType) {
    case 0:
      return 'Manual';
    case 1:
      return 'Chainlink Auto';
    case 2:
      return 'Chainlink Functions';
    default:
      return 'Manual';
  }
};

const STATUS_FILTERS = ['Active', 'Expired', 'Resolved'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

// Real-time countdown component for each market
function MarketCountdown({ expiryTimestamp }: { expiryTimestamp: bigint }) {
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  
  useEffect(() => {
    if (expiryTimestamp === 0n) {
      setTimeRemaining('N/A');
      return;
    }
    
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const expiry = Number(expiryTimestamp);
      const secondsRemaining = expiry - now;
      
      if (secondsRemaining <= 0) {
        setTimeRemaining('Expired');
        return;
      }
      
      const days = Math.floor(secondsRemaining / 86400);
      const hours = Math.floor((secondsRemaining % 86400) / 3600);
      const minutes = Math.floor((secondsRemaining % 3600) / 60);
      
      if (days > 0) {
        setTimeRemaining(`${days}D ${hours}H`);
      } else if (hours > 0) {
        setTimeRemaining(`${hours}H ${minutes}M`);
      } else {
        setTimeRemaining(`${minutes}M`);
      }
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [expiryTimestamp]);
  
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide">Time Remaining</span>
      <span className={`text-sm sm:text-base font-bold ${
        timeRemaining === 'Expired' 
          ? 'text-red-600' 
          : 'text-gray-900'
      }`}>
        {timeRemaining || formatTimeRemaining(expiryTimestamp)}
      </span>
    </div>
  );
}

interface MarketCard {
  id: number;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  yesPercent: number;
  noPercent: number;
  status: 'LIVE TRADING' | 'EXPIRED' | 'RESOLVED';
  totalPairsUSDC: bigint;
  expiryTimestamp: bigint;
  oracleType: number; // 0 = None, 1 = ChainlinkFeed, 2 = ChainlinkFunctions
  isResolved: boolean;
  yesWins?: boolean;
}

export default function MarketsPage() {
  const [marketCount, setMarketCount] = useState<number | null>(null);
  const [markets, setMarkets] = useState<MarketCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeStatusTab, setActiveStatusTab] = useState<StatusFilter | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showResolved, setShowResolved] = useState(true);
  const [showExpired, setShowExpired] = useState(true);
  const [minLiquidity, setMinLiquidity] = useState('');
  const [oracleFilter, setOracleFilter] = useState<'all' | 'manual' | 'chainlink'>('all');
  const publicClient = usePublicClient();

  useEffect(() => {
    loadMarkets();
    
    // Refresh markets every 30 seconds to update countdown timers
    const interval = setInterval(() => {
      loadMarkets();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadMarkets = async () => {
    try {
      const count = await getMarketCount();
      const countNum = Number(count);
      setMarketCount(countNum);
      
      // Create array of market IDs
      const marketIds = Array.from({ length: countNum }, (_, i) => i + 1);
      
      // Load all markets in parallel
      const marketPromises = marketIds.map(async (i) => {
        try {
          // Parallelize the calls for each market (market data, prices, and resolution)
          const [market, priceYes, resolution, state] = await Promise.all([
            getMarket(BigInt(i)),
            getPriceYes(BigInt(i)),
            getMarketResolution(BigInt(i)),
            getMarketState(BigInt(i)),
          ]);
          
          if (!market.exists) return null;

          // Determine status based on resolution and expiry
          const now = Math.floor(Date.now() / 1000);
          const expiryTimestamp = resolution.expiryTimestamp || 0n;
          const isExpired = expiryTimestamp > 0n && Number(expiryTimestamp) < now;

          let status: 'LIVE TRADING' | 'EXPIRED' | 'RESOLVED' = 'LIVE TRADING';
          if (resolution.isResolved) {
            status = 'RESOLVED';
          } else if (isExpired) {
            // Market has expired but not yet resolved
            status = 'EXPIRED';
          }

          const qYes = Number(formatUnits(state.qYes, 18));
          const qNo = Number(formatUnits(state.qNo, 18));
          const totalPairs = Number(formatUnits(state.vault, 6));
          const totalShares = qYes + qNo;

          let yesPercent = 50;
          let noPercent = 50;
          if (totalShares > 0) {
            yesPercent = Math.round((qYes / totalShares) * 100);
            noPercent = Math.round((qNo / totalShares) * 100);
          }

          const yesPriceNum = parseFloat(priceYes);
          const yesPriceClean = Number.isFinite(yesPriceNum) ? yesPriceNum : 0;
          const noPriceClean = Number.isFinite(yesPriceNum) ? Math.max(0, 1 - yesPriceNum) : 0;

          return {
            id: i,
            question: typeof market.question === 'string' ? market.question : String(market.question ?? 'Untitled Market'),
            yesPrice: yesPriceClean,
            noPrice: noPriceClean,
            volume: totalPairs,
            yesPercent,
            noPercent,
            status,
            totalPairsUSDC: state.vault,
            expiryTimestamp: resolution.expiryTimestamp || 0n,
            oracleType: resolution.oracleType || 0,
            isResolved: resolution.isResolved || false,
            yesWins: resolution.yesWins,
          } as MarketCard;
        } catch (error) {
          console.error(`Error loading market ${i}:`, error);
          return null;
        }
      });
      
      // Wait for all markets to load and filter out nulls
      const marketResults = await Promise.all(marketPromises);
      const marketArray = marketResults.filter((market): market is MarketCard => market !== null);
      
      setMarkets(marketArray);
    } catch (error) {
      console.error('Error loading markets:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredMarkets = markets.filter(market => {
    if (searchTerm && !market.question.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    if (activeStatusTab) {
      switch (activeStatusTab) {
        case 'Active':
          if (market.status !== 'LIVE TRADING') return false;
          break;
        case 'Expired':
          if (market.status !== 'EXPIRED') return false;
          break;
        case 'Resolved':
          if (market.status !== 'RESOLVED') return false;
          break;
        default:
          break;
      }
    }

    if (activeCategory !== 'All') {
      const categoryLower = activeCategory.toLowerCase();
      const questionLower = market.question.toLowerCase();

      if (categoryLower === 'crypto') {
        const cryptoKeywords = ['btc', 'bitcoin', 'eth', 'ethereum', 'crypto', 'sol', 'solana', 'xrp', 'doge', 'dogecoin', 'bnb', 'matic'];
        if (!cryptoKeywords.some(keyword => questionLower.includes(keyword))) {
          return false;
        }
      } else if (!questionLower.includes(categoryLower)) {
        return false;
      }
    }

    if (!showResolved && market.status === 'RESOLVED') return false;
    if (!showExpired && market.status === 'EXPIRED') return false;

    if (minLiquidity) {
      const min = parseFloat(minLiquidity) || 0;
      const liquidity = Number(formatUnits(market.totalPairsUSDC, 6));
      if (liquidity < min) return false;
    }

    if (oracleFilter !== 'all') {
      const isManual = market.oracleType === 0;
      if (oracleFilter === 'manual' && !isManual) return false;
      if (oracleFilter === 'chainlink' && isManual) return false;
    }

    return true;
  });

  const stats = useMemo(() => {
    if (markets.length === 0) {
      return {
        liquidity: 0,
        live: 0,
        resolved: 0,
        expired: 0,
        total: 0,
      };
    }

    let liquidity = 0;
    let live = 0;
    let resolved = 0;
    let expired = 0;

    for (const market of markets) {
      liquidity += Number(formatUnits(market.totalPairsUSDC, 6));
      if (market.status === 'LIVE TRADING') live += 1;
      else if (market.status === 'RESOLVED') resolved += 1;
      else if (market.status === 'EXPIRED') expired += 1;
    }

    return {
      liquidity,
      live,
      resolved,
      expired,
      total: markets.length,
    };
  }, [markets]);

  const formatNumber = useCallback((value: number, decimals = 0) => {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }, []);

  const liquidityDisplay = stats.liquidity >= 1 ? formatNumber(stats.liquidity, stats.liquidity >= 1000 ? 0 : 2) : formatNumber(stats.liquidity, 2);
   
  // Fetch unique traders count from on-chain trade events
  const { data: activeTraders = 0 } = useQuery({
    queryKey: ['uniqueTraders'],
    queryFn: async () => {
      try {
        const data = await fetchSubgraph<{
          globalState: { uniqueTraders: number } | null;
        }>(
          `
            query UniqueTraders($id: ID!) {
              globalState(id: $id) {
                uniqueTraders
              }
            }
          `,
          { id: 'global' },
        );
        return Number.isFinite(data.globalState?.uniqueTraders)
          ? Number(data.globalState?.uniqueTraders ?? 0)
          : 0;
      } catch (error) {
        console.error('Error fetching unique traders stats from subgraph:', error);
        return 0;
      }
    },
    refetchInterval: 120_000,
  });

  const categories = ['All', 'Crypto', 'Bitcoin', 'Ethereum', 'Politics', 'Sports', 'Tech', 'Finance'];

  const getMarketLogo = (question?: string | null): string => {
    const normalized = typeof question === 'string' ? question : question != null ? String(question) : '';
    const q = normalized.toLowerCase();
    // More specific matches first to avoid false positives
    if (q.includes('aster')) return '/logos/ASTER_solana.png';
    if (q.includes('zcash') || q.includes('zec')) return '/logos/default.png'; // ZCASH logo not available yet
    if (q.includes('doge') || q.includes('dogecoin')) return '/logos/default.png'; // DOGE logo not available yet
    if (q.includes('btc') || q.includes('bitcoin')) return '/logos/BTC_ethereum.png';
    if (q.includes('eth') || q.includes('ethereum')) return '/logos/ETH_ethereum.png';
    if (q.includes('sol') || q.includes('solana')) return '/logos/SOL_solana.png';
    if (q.includes('xrp') || q.includes('ripple')) return '/logos/XRP_ethereum.png';
    if (q.includes('bnb') || q.includes('binance')) return '/logos/BNB_bsc.png';
    if (q.includes('ada') || q.includes('cardano')) return '/logos/ADA_ethereum.png';
    if (q.includes('atom') || q.includes('cosmos')) return '/logos/ATOM_ethereum.png';
    if (q.includes('dai')) return '/logos/DAI_ethereum.png';
    if (q.includes('usdt') || q.includes('tether')) return '/logos/USDT_ethereum.png';
    if (q.includes('tao')) return '/logos/TAO_ethereum.png';
    if (q.includes('will')) return '/logos/WILL_ethereum.png';
    if (q.includes('google')) return '/logos/GOOGLE_ethereum.png';
    // Default fallback
    return '/logos/default.png';
  };

  return (
    <div className="min-h-screen bg-[#f5f0ff] relative overflow-hidden">
      {/* Animated Background - Figma inspired */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-[#14B8A6]/10 to-purple-400/10 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-blue-400/10 to-[#14B8A6]/10 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, -90, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
        />
      </div>

      <Header />

      <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12 md:py-16">
        {/* Header Section - Figma Design */}
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-6 translate-y-[-1rem] animate-fade-in opacity-0">
            <svg className="w-5 h-5 text-[#14B8A6]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div className="[font-family:'Geist',Helvetica] font-semibold text-[#14B8A6] text-sm tracking-[0.35px] leading-5">
              BROWSE MARKETS
            </div>
          </div>
          <h1 className="[font-family:'Geist',Helvetica] font-bold text-[#0f0a2e] text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-[0] leading-tight sm:leading-[50px] md:leading-[60px] mb-6 translate-y-[-1rem] animate-fade-in opacity-0 [--animation-delay:200ms]">
            What&apos;s the Market Thinking?
          </h1>
          <p className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-base sm:text-lg tracking-[0] leading-6 sm:leading-7 mb-8 max-w-[668px] translate-y-[-1rem] animate-fade-in opacity-0 [--animation-delay:400ms]">
            Trade what you believe in every market reflects real-time sentiment and liquidity.
          </p>
        </div>

        {/* Stats Banner - Figma Design with Logo Patterns */}
        <div className="relative bg-white rounded-2xl border-2 border-[#14B8A6] border-solid shadow-lg mb-8 sm:mb-12 translate-y-[-1rem] animate-fade-in opacity-0 [--animation-delay:600ms] overflow-hidden" style={{ boxSizing: 'border-box' }}>
          {/* Left Logo - Subtle background on mobile */}
          <div className="absolute left-0 top-0 bottom-0 w-12 sm:w-16 md:w-[182px] pointer-events-none flex items-center justify-center overflow-hidden opacity-15 sm:opacity-30 md:opacity-100">
            <Image
              src="/leftside.png"
              alt="SpeculateX Logo"
              width={182}
              height={155}
              className="object-contain w-full h-full"
              unoptimized
            />
          </div>

          {/* Stats Content */}
          <div className="relative z-10 grid grid-cols-3 md:flex md:items-center md:justify-center gap-2 sm:gap-3 md:gap-12 lg:gap-20 xl:gap-32 px-3 sm:px-4 md:px-8 py-5 sm:py-6 md:py-0 min-h-[140px] md:min-h-[155px]">
            {/* Total Liquidity */}
            <div className="flex flex-col items-center justify-center gap-1.5 sm:gap-2 md:gap-4">
              <div className="font-inter text-gray-500 text-[9px] sm:text-[10px] md:text-[11px] text-center tracking-[0.55px] leading-[17.6px] uppercase">
                TOTAL LIQUIDITY
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <div className="font-inter text-[#0a0e17] text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-[32px] text-center tracking-[0] leading-tight font-bold">
                  ${liquidityDisplay}
                </div>
                <div className="font-inter text-[#0a0e17] text-sm sm:text-base md:text-lg lg:text-xl text-center tracking-[0] leading-tight font-bold">
                  USDC pooled
                </div>
              </div>
              <div className="font-inter text-[#475569] text-[9px] sm:text-[10px] md:text-xs text-center tracking-[0] leading-[19.2px]">
                Across {stats.total} markets
              </div>
            </div>

            {/* Active Traders */}
            <div className="flex flex-col items-center justify-center gap-1.5 sm:gap-2 md:gap-4">
              <div className="font-inter text-gray-500 text-[9px] sm:text-[10px] md:text-[11px] text-center tracking-[0.55px] leading-[17.6px] uppercase">
                ACTIVE TRADERS
              </div>
              <div className="font-inter text-[#0a0e17] text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-[32px] text-center tracking-[0] leading-tight font-bold">
                {formatNumber(typeof activeTraders === 'number' ? activeTraders : Number(activeTraders) || 0)}
              </div>
              <div className="font-inter text-[#475569] text-[9px] sm:text-[10px] md:text-xs text-center tracking-[0] leading-[19.2px]">
                Updated every minute
              </div>
            </div>

            {/* Live Markets */}
            <div className="flex flex-col items-center justify-center gap-1.5 sm:gap-2 md:gap-4">
              <div className="font-inter text-gray-500 text-[9px] sm:text-[10px] md:text-[11px] text-center tracking-[0.55px] leading-[17.6px] uppercase">
                LIVE MARKETS
              </div>
              <div className="font-inter text-[#0a0e17] text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-[32px] text-center tracking-[0] leading-tight font-bold">
                {formatNumber(stats.live)}
              </div>
              <div className="font-inter text-[#475569] text-[9px] sm:text-[10px] md:text-xs text-center tracking-[0] leading-[19.2px]">
                Resolved: {formatNumber(stats.resolved)} • Awaiting: {formatNumber(stats.expired)}
              </div>
            </div>
          </div>

          {/* Right Logo - Subtle background on mobile */}
          <div className="absolute right-0 top-0 bottom-0 w-12 sm:w-16 md:w-[189px] pointer-events-none flex items-center justify-center overflow-hidden opacity-15 sm:opacity-30 md:opacity-100">
            <Image
              src="/rightside.png"
              alt="SpeculateX Logo"
              width={189}
              height={155}
              className="object-contain w-full h-full"
              unoptimized
            />
          </div>
        </div>

        {/* Search and Filters - Figma Design */}
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-col gap-4 sm:gap-6 mb-6 sm:mb-8"
        >
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveStatusTab(prev => (prev === tab ? null : tab))}
                className={`relative px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  activeStatusTab === tab
                    ? 'bg-[#2DD4BF] text-white shadow'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch gap-3 sm:gap-4">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6b717f99]" />
              <Input
                placeholder="Search markets..."
                className="pl-12 h-12 bg-white rounded-2xl border-[#e5e6ea80] shadow-[0px_1px_2px_#0000000d] [font-family:'Geist',Helvetica] text-sm focus:border-[#14B8A6]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative">
              <Button
                variant="outline"
                onClick={() => setShowFilters(prev => !prev)}
                className="h-12 px-6 bg-[#ffffff01] rounded-2xl border-[#e5e6ea80] shadow-[0px_1px_2px_#0000000d] [font-family:'Geist',Helvetica] font-medium text-[#0f0a2e] text-sm hover:bg-white transition-colors"
              >
                <SlidersHorizontalIcon className="w-4 h-4 mr-2" />
                More Filters
              </Button>

              {showFilters && (
                <div className="absolute right-0 mt-3 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl p-5 z-20">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">Advanced Filters</h3>
                    <button
                      onClick={() => setShowFilters(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Market Status</label>
                      <div className="mt-2 space-y-2">
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={showResolved}
                            onChange={(e) => setShowResolved(e.target.checked)}
                            className="rounded border-gray-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                          />
                          Show resolved markets
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={showExpired}
                            onChange={(e) => setShowExpired(e.target.checked)}
                            className="rounded border-gray-300 text-[#14B8A6] focus:ring-[#14B8A6]"
                          />
                          Show awaiting resolution
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Minimum Liquidity (USDC)</label>
                      <input
                        type="number"
                        value={minLiquidity}
                        onChange={(e) => setMinLiquidity(e.target.value)}
                        placeholder="e.g. 500"
                        className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#14B8A6]"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Oracle Type</label>
                      <div className="mt-2 space-y-2">
                        {[
                          { label: 'All', value: 'all' },
                          { label: 'Manual resolution', value: 'manual' },
                          { label: 'Chainlink', value: 'chainlink' },
                        ].map(option => (
                          <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="radio"
                              name="oracle-filter"
                              value={option.value}
                              checked={oracleFilter === option.value}
                              onChange={() => setOracleFilter(option.value as typeof oracleFilter)}
                              className="text-[#14B8A6] focus:ring-[#14B8A6]"
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowFilters(false);
                        setShowResolved(true);
                        setShowExpired(true);
                        setMinLiquidity('');
                        setOracleFilter('all');
                      }}
                      className="w-full justify-center"
                    >
                      Reset filters
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        <div className="mb-6">
          <p className="[font-family:'Geist',Helvetica] text-sm text-gray-500">
            <span className="font-medium">Showing </span>
            <span className="font-semibold text-[#0f0a2e]">{filteredMarkets.length}</span>
            <span className="font-medium"> markets</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          {categories.map((category, index) => (
            <Badge
              key={category}
              variant={activeCategory === category ? "default" : "secondary"}
              className={`h-[42px] px-6 rounded-full cursor-pointer transition-colors ${
                activeCategory === category
                  ? "bg-[#14B8A6] hover:bg-[#0D9488] text-white border-0"
                  : "bg-[#f0f0f280] hover:bg-[#e5e6ea80] text-[#0e092db2] border border-[#e5e6ea4c]"
              } [font-family:'Geist',Helvetica] font-medium text-sm`}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </Badge>
          ))}
        </div>

        {/* Market Cards Grid */}
        <div id="markets">
          {loading ? (
            <div className="text-center py-20">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="inline-block w-16 h-16 border-4 border-[#14B8A6] border-t-transparent rounded-full"
              />
              <p className="mt-6 text-lg font-semibold text-gray-600">Loading markets...</p>
            </div>
          ) : filteredMarkets.length === 0 ? (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-300 shadow-lg"
            >
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No markets found</h3>
              <p className="text-gray-600 mb-6">Try adjusting your search or filters</p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setSearchTerm('');
                  setActiveCategory('All');
                }}
                className="px-6 py-3 bg-[#14B8A6] text-white font-semibold rounded-lg hover:bg-[#0D9488] transition-colors"
              >
                Clear Filters
              </motion.button>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6">
                {filteredMarkets.map((market, index) => (
                  <motion.div
                    key={market.id}
                    initial={{ scale: 0.8, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ delay: index * 0.05 }}
                    style={{
                      "--animation-delay": `${400 + index * 100}ms`,
                    } as React.CSSProperties}
                  >
                    <Link href={`/markets/${market.id}`}>
                      <Card className="overflow-hidden border-0 shadow-lg bg-white hover:shadow-2xl transition-all cursor-pointer h-full group rounded-2xl">
                        <CardContent className="p-4 sm:p-5 md:p-6">
                          {/* Header - Icon, Question, and Status Badges */}
                          <div className="mb-4 sm:mb-6">
                            <div className="flex items-center gap-3 sm:gap-4 mb-2">
                              <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-white rounded-full flex items-center justify-center flex-shrink-0 border-2 border-gray-200 shadow-sm overflow-hidden">
                                <Image
                                  src={getMarketLogo(market.question)}
                                  alt={market.question}
                                  width={64}
                                  height={64}
                                  className="w-full h-full object-contain p-1"
                                  unoptimized
                                  onError={(e) => {
                                    // Fallback to default if image fails to load
                                    const target = e.target as HTMLImageElement;
                                    target.src = '/logos/default.png';
                                  }}
                                />
                              </div>
                              <h3 className="text-base sm:text-lg font-bold text-gray-900 flex-1 line-clamp-2">
                                {market.question}
                              </h3>
                            </div>
                            {/* Status and Resolution Type Badges */}
                            <div className="flex items-center gap-2 flex-wrap ml-[52px] sm:ml-[60px] md:ml-[68px]">
                              <Badge 
                                variant={market.status === 'RESOLVED' ? 'secondary' : market.status === 'EXPIRED' ? 'destructive' : market.status === 'LIVE TRADING' ? 'default' : 'outline'}
                                className={`text-[10px] px-2 py-0.5 ${
                                  market.status === 'RESOLVED' 
                                    ? 'bg-gray-100 text-gray-700' 
                                    : market.status === 'EXPIRED'
                                    ? 'bg-orange-100 text-orange-700'
                                    : market.status === 'LIVE TRADING'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-yellow-100 text-yellow-700'
                                }`}
                              >
                                {market.status}
                              </Badge>
                              {market.oracleType > 0 && (
                                <Badge 
                                  variant="outline"
                                  className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border-blue-200"
                                >
                                  {getResolutionTypeLabel(market.oracleType)}
                                </Badge>
                              )}
                              {market.isResolved && market.yesWins !== undefined && (
                                <Badge 
                                  variant="default"
                                  className={`text-[10px] px-2 py-0.5 ${
                                    market.yesWins 
                                      ? 'bg-green-500 text-white' 
                                      : 'bg-red-500 text-white'
                                  }`}
                                >
                                  Winner: {market.yesWins ? 'YES' : 'NO'}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Yes/No Buttons */}
                          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
                            <button className="bg-green-50 hover:bg-green-100 rounded-lg py-3 sm:py-4 px-3 sm:px-4 text-center transition-colors">
                              <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
                                <div className="text-sm sm:text-base font-bold text-green-700">Yes</div>
                                <div className="text-[10px] sm:text-xs font-bold text-gray-600">{formatPriceInCents(market.yesPrice)}</div>
                              </div>
                            </button>
                            <button className="bg-red-50 hover:bg-red-100 rounded-lg py-3 sm:py-4 px-3 sm:px-4 text-center transition-colors">
                              <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
                                <div className="text-sm sm:text-base font-bold text-red-700">No</div>
                                <div className="text-[10px] sm:text-xs font-bold text-gray-600">{formatPriceInCents(market.noPrice)}</div>
                              </div>
                            </button>
                          </div>

                          {/* Progress Bar - Red on left, Green on right */}
                          <div className="mb-4 sm:mb-6">
                            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                              <div className="flex h-full">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${market.noPercent}%` }}
                                  transition={{ duration: 1, delay: index * 0.05 }}
                                  className="bg-red-500 h-full"
                                />
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${market.yesPercent}%` }}
                                  transition={{ duration: 1, delay: index * 0.05 }}
                                  className="bg-green-500 h-full"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Footer - Volume, Time Remaining, and Duration */}
                          <div className="space-y-2 sm:space-y-3 pt-3 sm:pt-4 border-t border-gray-100">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide">Volume</span>
                              <span className="text-sm sm:text-base font-bold text-gray-900">
                                ${market.volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            {market.expiryTimestamp > 0n && (
                              <>
                                <MarketCountdown expiryTimestamp={market.expiryTimestamp} />
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide">Resolution</span>
                                  <span className="text-xs sm:text-sm font-semibold text-gray-700">
                                    {market.expiryTimestamp > 0n 
                                      ? new Date(Number(market.expiryTimestamp) * 1000).toLocaleDateString(undefined, {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })
                                      : 'N/A'
                                    }
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          )}
        </div>
      </main>
      {/* Footer */}
      <footer className="w-full bg-[#fffefe66] border-t border-border mt-12 sm:mt-20">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-12 lg:px-20 py-8 sm:py-12 md:py-16 lg:py-20">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8 sm:mb-12 md:mb-16">
            <div className="flex flex-col gap-4 sm:gap-6">
              <h3 className="[font-family:'Geist',Helvetica] font-semibold text-[#0f0a2e] text-sm sm:text-base leading-6">
                Product
              </h3>
              <div className="flex flex-col gap-3 sm:gap-[18px]">
                <Link href="/markets" className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-xs sm:text-sm leading-5 hover:text-gray-700 transition-colors">
                  Markets
                </Link>
                <Link href="/admin" className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-xs sm:text-sm leading-5 hover:text-gray-700 transition-colors">
                  Create Market
                </Link>
                <a href="#" className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-xs sm:text-sm leading-5 hover:text-gray-700 transition-colors">
                  API
                </a>
              </div>
            </div>
            <div className="flex flex-col gap-4 sm:gap-6">
              <h3 className="[font-family:'Geist',Helvetica] font-semibold text-[#0f0a2e] text-sm sm:text-base leading-6">
                Resources
              </h3>
              <div className="flex flex-col gap-3 sm:gap-[18px]">
                <a href="#" className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-xs sm:text-sm leading-5 hover:text-gray-700 transition-colors">
                  Documentation
                </a>
                <a href="#" className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-xs sm:text-sm leading-5 hover:text-gray-700 transition-colors">
                  FAQ
                </a>
                <a href="#" className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-xs sm:text-sm leading-5 hover:text-gray-700 transition-colors">
                  Blog
                </a>
              </div>
            </div>
            <div className="flex flex-col gap-4 sm:gap-6">
              <h3 className="[font-family:'Geist',Helvetica] font-semibold text-[#0f0a2e] text-sm sm:text-base leading-6">
                Community
              </h3>
              <div className="flex flex-col gap-3 sm:gap-[18px]">
                <a href="#" className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-xs sm:text-sm leading-5 hover:text-gray-700 transition-colors">
                  Discord
                </a>
                <a href="#" className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-xs sm:text-sm leading-5 hover:text-gray-700 transition-colors">
                  Twitter
                </a>
                <a href="#" className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-xs sm:text-sm leading-5 hover:text-gray-700 transition-colors">
                  Governance
                </a>
              </div>
            </div>
            <div className="flex flex-col gap-4 sm:gap-6">
              <h3 className="[font-family:'Geist',Helvetica] font-semibold text-[#0f0a2e] text-sm sm:text-base leading-6">
                Legal
              </h3>
              <div className="flex flex-col gap-3 sm:gap-[18px]">
                <a href="#" className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-xs sm:text-sm leading-5 hover:text-gray-700 transition-colors">
                  Privacy
                </a>
                <a href="#" className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-xs sm:text-sm leading-5 hover:text-gray-700 transition-colors">
                  Terms
                </a>
                <a href="#" className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-xs sm:text-sm leading-5 hover:text-gray-700 transition-colors">
                  Security
                </a>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-0 pt-4 sm:pt-6 border-t border-[#e5e6ea80]">
            <p className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-xs sm:text-sm leading-5 text-center sm:text-left">
              © 2025 SpeculateX. All rights reserved.
            </p>
            <p className="[font-family:'Geist',Helvetica] font-light text-gray-500 text-xs sm:text-sm leading-5 text-center sm:text-right">
              Built for the decentralized web
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
