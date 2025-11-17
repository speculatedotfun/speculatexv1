'use client';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { formatUnits } from 'viem';

interface MarketHeaderProps {
  market: any;
  resolution: any;
  totalVolume: number;
  createdAtDate: Date | null;
  logoSrc: string;
  marketIsActive: boolean;
  onLogoError: () => void;
}

export function MarketHeader({
  market,
  resolution,
  totalVolume,
  createdAtDate,
  logoSrc,
  marketIsActive,
  onLogoError,
}: MarketHeaderProps) {
  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="bg-gray-50 rounded-2xl p-4 sm:p-6 md:p-8 shadow-lg border border-gray-200 mb-6 sm:mb-8"
      data-testid="market-header"
    >
      {/* LIVE Indicator and Header */}
      <div className="flex items-start justify-between mb-6">
        {/* LIVE Indicator - Top Left */}
        <div className="flex items-center gap-2">
          {marketIsActive && (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-2 h-2 bg-red-500 rounded-full"
            />
          )}
          <span className={`text-xs font-bold uppercase tracking-wide ${marketIsActive ? 'text-red-500' : 'text-gray-500'}`}>
            {marketIsActive ? 'LIVE' : 'CLOSED'}
          </span>
        </div>
        {/* Action Icons - Top Right */}
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </motion.button>
        </div>
      </div>
      {/* Market Icon and Question */}
      <div className="flex items-start gap-3 sm:gap-4 md:gap-6 mb-4">
        {/* Large Circular Icon with Logo */}
        <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-white rounded-full flex items-center justify-center flex-shrink-0 border-2 border-gray-200 shadow-sm overflow-hidden">
          <Image
            src={logoSrc}
            alt={market.question as string}
            width={80}
            height={80}
            className="w-full h-full object-contain p-1"
            unoptimized
            onError={onLogoError}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-gray-900 mb-2 sm:mb-3 break-words">{market.question}</h1>
          <div className="text-xs sm:text-sm text-gray-500">
            <span className="font-medium">
              Vol ${totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="mx-2">•</span>
            <span>
              Created{' '}
              {createdAtDate
                ? createdAtDate.toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </span>
          </div>
        </div>
      </div>
      {/* Rules Section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-6 pt-6 border-t border-gray-300"
      >
        <h3 className="text-base font-bold text-gray-900 mb-3">Rules</h3>
        <p className="text-sm text-gray-600 leading-relaxed">
          {resolution?.oracleType === 0 ? 'This market will be resolved manually by the admin.' : ''}
          {resolution?.oracleType === 1 ? `Market resolves YES if price is ${resolution?.comparison === 0 ? 'above' : resolution?.comparison === 1 ? 'below' : 'equal to'} $${Number(formatUnits(resolution?.targetValue || 0n, 8)).toLocaleString()} at expiry. Otherwise resolves NO.` : ''}
        </p>
      </motion.div>
    </motion.div>
  );
}




