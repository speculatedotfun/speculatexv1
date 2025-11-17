'use client';
import { motion } from 'framer-motion';
import type { Holder } from '@/lib/marketTransformers';

interface TopHoldersCardProps {
  holderTab: 'yes' | 'no';
  setHolderTab: (tab: 'yes' | 'no') => void;
  topHoldersYes: Holder[];
  topHoldersNo: Holder[];
  address?: string;
  yesBalance: string;
  noBalance: string;
  priceYes: number;
  priceNo: number;
}

export function TopHoldersCard({
  holderTab,
  setHolderTab,
  topHoldersYes,
  topHoldersNo,
  address,
  yesBalance,
  noBalance,
  priceYes,
  priceNo,
}: TopHoldersCardProps) {
  return (
    <motion.div
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.5 }}
      className="bg-white rounded-2xl p-6 shadow-xl border border-gray-100"
    >
      <h3 className="text-xl font-black text-gray-900 mb-6">Top Holders</h3>
      <div className="flex gap-2 mb-6">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setHolderTab('yes')}
          className={`flex-1 px-4 py-3 rounded-xl font-bold text-sm transition-all shadow-md ${
            holderTab === 'yes'
              ? 'bg-gradient-to-r from-green-400 to-green-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          YES
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setHolderTab('no')}
          className={`flex-1 px-4 py-3 rounded-xl font-bold text-sm transition-all shadow-md ${
            holderTab === 'no'
              ? 'bg-gradient-to-r from-red-400 to-red-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          NO
        </motion.button>
      </div>
      <div className="space-y-3">
        {holderTab === 'yes' ? (
          topHoldersYes.length > 0 ? (
            topHoldersYes.map((holder, idx) => (
              <motion.div
                key={idx}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="flex justify-between items-center py-3 px-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <span className="text-sm font-bold text-gray-900 truncate mr-2">
                  {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                </span>
                <span className="text-sm font-bold text-[#14B8A6]">${holder.balanceUsd.toFixed(2)}</span>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-8 text-sm text-gray-500 font-semibold">No holders yet</div>
          )
        ) : (
          topHoldersNo.length > 0 ? (
            topHoldersNo.map((holder, idx) => (
              <motion.div
                key={idx}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="flex justify-between items-center py-3 px-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <span className="text-sm font-bold text-gray-900 truncate mr-2">
                  {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                </span>
                <span className="text-sm font-bold text-[#14B8A6]">${holder.balanceUsd.toFixed(2)}</span>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-8 text-sm text-gray-500 font-semibold">No holders yet</div>
          )
        )}
        {address && holderTab === 'yes' && parseFloat(yesBalance) > 0 && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex justify-between items-center py-3 px-4 bg-gradient-to-r from-[#14B8A6]/10 to-[#14B8A6]/5 rounded-lg border-2 border-[#14B8A6]/20 mt-4"
          >
            <span className="text-sm font-bold text-gray-900">You</span>
            <span className="text-sm font-bold text-[#14B8A6]">${(parseFloat(yesBalance) * priceYes).toFixed(2)}</span>
          </motion.div>
        )}
        {address && holderTab === 'no' && parseFloat(noBalance) > 0 && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex justify-between items-center py-3 px-4 bg-gradient-to-r from-[#14B8A6]/10 to-[#14B8A6]/5 rounded-lg border-2 border-[#14B8A6]/20 mt-4"
          >
            <span className="text-sm font-bold text-gray-900">You</span>
            <span className="text-sm font-bold text-[#14B8A6]">${(parseFloat(noBalance) * priceNo).toFixed(2)}</span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}




