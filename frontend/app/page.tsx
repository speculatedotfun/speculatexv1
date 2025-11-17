// @ts-nocheck
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { getMarketCount, getMarket, getMarketState } from '@/lib/hooks';
import { formatUnits } from 'viem';
import { useQuery } from '@tanstack/react-query';
import { fetchSubgraph } from '@/lib/subgraphClient';

export default function Home() {
  const [marketCount, setMarketCount] = useState<number>(0);
  const [stats, setStats] = useState({
    liquidity: 0,
    live: 0,
    resolved: 0,
    expired: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const countBn = await getMarketCount();
      const count = Number(countBn);
      setMarketCount(count);

      if (count === 0) {
        setStats({ liquidity: 0, live: 0, resolved: 0, expired: 0 });
        return;
      }

      let liquidity = 0;
      let live = 0;
      let resolved = 0;
      let expired = 0;

      for (let i = 1; i <= count; i++) {
        const marketId = BigInt(i);
        const [market, state] = await Promise.all([
          getMarket(marketId),
          getMarketState(marketId),
        ]);
        if (!market.exists) continue;

        liquidity += Number(formatUnits(state.vault, 6));

        if (market.status === 0) {
          live += 1;
        } else if (market.status === 1) {
          resolved += 1;
        } else {
          expired += 1;
        }
      }

      setStats({ liquidity, live, resolved, expired });
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };
  const { data: traders = 0 } = useQuery({
    queryKey: ['uniqueTraders-home'],
    staleTime: 30_000,
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
        return Number(data.globalState?.uniqueTraders ?? 0);
      } catch (error) {
        console.error('Error fetching trader count from subgraph:', error);
        return 0;
      }
    },
  });

  const formatCurrency = useCallback((value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  }, []);

  const formatNumber = useCallback((value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  }, []);

  const liquidityDisplay = useMemo(() => formatCurrency(stats.liquidity), [stats.liquidity, formatCurrency]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 relative overflow-hidden">
      {/* Animated Background Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          className="absolute top-0 left-0 w-[600px] h-[600px] bg-gradient-to-br from-[#14B8A6] to-[#0D9488] rounded-full mix-blend-multiply filter blur-3xl opacity-20"
          animate={{
            x: [0, 100, 0],
            y: [0, 50, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-purple-400 to-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20"
          animate={{
            x: [0, -50, 0],
            y: [0, 100, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
        />
        <motion.div 
          className="absolute bottom-0 left-1/2 w-[550px] h-[550px] bg-gradient-to-br from-blue-400 to-cyan-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20"
          animate={{
            x: [0, -100, 0],
            y: [0, -50, 0],
            scale: [1, 1.15, 1],
          }}
          transition={{
            duration: 22,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 4
          }}
        />
      </div>

      {/* Header */}
      <motion.header 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 border-b border-white/20 backdrop-blur-md bg-white/40"
      >
        <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 sm:h-20 items-center justify-between">
            <Link href="/" className="flex items-center">
              <Image
                src="/logo.jpg"
                alt="SpeculateX Logo"
                width={120}
                height={32}
                className="h-7 sm:h-8 w-auto object-contain"
                unoptimized
              />
            </Link>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/markets"
                className="rounded-full bg-[#14B8A6] px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-[#0D9488] transition-all shadow-lg hover:shadow-xl"
              >
                <span className="hidden sm:inline">Launch App</span>
                <span className="sm:hidden">Launch</span>
              </Link>
            </motion.div>
          </div>
        </nav>
      </motion.header>

      {/* Main Content - Centered */}
      <main className="relative z-10 min-h-[calc(100vh-4rem)] sm:min-h-[calc(100vh-5rem)] flex items-center justify-center py-8 sm:py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center w-full">
          {/* Beta Badge */}
          <motion.div 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="mb-6 sm:mb-8 inline-flex"
          >
            <div className="relative inline-flex items-center h-8 sm:h-10 px-3 sm:px-5 rounded-full border-2 border-[#14B8A6]/30 bg-white/80 backdrop-blur-sm shadow-lg overflow-hidden">
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                animate={{ x: [-200, 200] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
              <motion.div 
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#14B8A6] mr-2 sm:mr-3"
              />
              <span className="relative z-10 text-[10px] sm:text-xs md:text-sm font-bold text-[#14B8A6] uppercase tracking-wider">Live on BNB Chain</span>
            </div>
          </motion.div>

          {/* Hero Heading */}
          <motion.h1 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black leading-[1.1] mb-6 sm:mb-8 tracking-tight px-4"
          >
            <span className="bg-gradient-to-r from-[#14B8A6] via-[#0D9488] to-[#14B8A6] bg-clip-text text-transparent animate-gradient">
              be the market
            </span>
          </motion.h1>

          {/* Description */}
          <motion.p 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-600 mb-8 sm:mb-10 max-w-3xl mx-auto leading-relaxed px-4"
          >
            Create prediction markets with bonding curves. Trade outcomes. Earn from every transaction.
          </motion.p>

          {/* CTA Button */}
          <motion.div 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.8 }}
            className="flex justify-center mb-8 sm:mb-12"
          >
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/markets"
                className="group relative inline-flex items-center justify-center h-12 sm:h-14 px-6 sm:px-8 rounded-full bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-base sm:text-lg font-bold text-white shadow-xl overflow-hidden"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-[#0D9488] to-[#14B8A6]"
                  initial={{ x: '100%' }}
                  whileHover={{ x: 0 }}
                  transition={{ duration: 0.3 }}
                />
                <span className="relative z-10 flex items-center">
                  Launch App
                  <svg className="ml-2 sm:ml-3 w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
                <div className="absolute inset-0 blur-xl bg-[#14B8A6]/50 group-hover:bg-[#14B8A6]/70 transition-all -z-10"></div>
              </Link>
            </motion.div>
          </motion.div>

          {/* Stats Grid */}
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.8 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 max-w-5xl mx-auto mb-8 sm:mb-10"
          >
            {/* Active Markets */}
            <motion.div 
              whileHover={{ y: -5, scale: 1.02 }}
              className="group relative bg-white/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-gray-100 hover:border-[#14B8A6] transition-all shadow-lg hover:shadow-2xl"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider">Active Markets</div>
                <motion.div 
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.5 }}
                  className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-[#14B8A6]/10 flex items-center justify-center"
                >
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 text-[#14B8A6]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </motion.div>
              </div>
              <motion.div 
                key={marketCount}
                initial={{ scale: 1.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-2xl sm:text-3xl md:text-4xl font-black text-[#14B8A6] mb-1"
              >
                {formatNumber(stats.live)}
              </motion.div>
              <div className="text-xs sm:text-sm text-gray-500">Live markets</div>
            </motion.div>

            {/* Total Volume */}
            <motion.div 
              whileHover={{ y: -5, scale: 1.02 }}
              className="group relative bg-white/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-gray-100 hover:border-[#14B8A6] transition-all shadow-lg hover:shadow-2xl"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider">Total Volume</div>
                <motion.div 
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.5 }}
                  className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-[#14B8A6]/10 flex items-center justify-center"
                >
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 text-[#14B8A6]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                  </svg>
                </motion.div>
              </div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-black text-[#14B8A6] mb-1">
                {liquidityDisplay}
              </div>
              <div className="text-xs sm:text-sm text-gray-500">USDC pooled</div>
            </motion.div>

            {/* Traders */}
            <motion.div 
              whileHover={{ y: -5, scale: 1.02 }}
              className="group relative bg-white/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-gray-100 hover:border-[#14B8A6] transition-all shadow-lg hover:shadow-2xl"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider">Traders</div>
                <motion.div 
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.5 }}
                  className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-[#14B8A6]/10 flex items-center justify-center"
                >
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 text-[#14B8A6]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                </motion.div>
              </div>
              <motion.div 
                key={typeof traders === 'number' ? traders : Number(traders) || 0}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                className="text-2xl sm:text-3xl md:text-4xl font-black text-[#14B8A6] mb-1"
              >
                {formatNumber(typeof traders === 'number' ? traders : Number(traders) || 0)}
              </motion.div>
              <div className="text-xs sm:text-sm text-gray-500">Active traders</div>
            </motion.div>

            {/* Trading Fee */}
            <motion.div 
              whileHover={{ y: -5, scale: 1.02 }}
              className="group relative bg-white/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-gray-100 hover:border-[#14B8A6] transition-all shadow-lg hover:shadow-2xl"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider">Trading Fee</div>
                <motion.div 
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.5 }}
                  className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-[#14B8A6]/10 flex items-center justify-center"
                >
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 text-[#14B8A6]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </motion.div>
              </div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-black text-[#14B8A6] mb-1">2%</div>
              <div className="text-xs sm:text-sm text-gray-500">Treasury + LP</div>
            </motion.div>
          </motion.div>

          {/* Feature Pills */}
          <motion.div 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.8 }}
            className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 px-4"
          >
            {[
              'Instant Settlement',
              'Oracle Verified',
              'Non-Custodial',
              'CPMM Powered'
            ].map((feature, index) => (
              <motion.div
                key={feature}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 1.2 + index * 0.1 }}
                whileHover={{ scale: 1.05 }}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-5 py-2 sm:py-2.5 md:py-3 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200 shadow-lg hover:border-[#14B8A6] hover:shadow-xl transition-all"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[#14B8A6]" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-xs sm:text-sm font-semibold text-gray-700 whitespace-nowrap">{feature}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </main>

      <style jsx global>{`
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  );
}