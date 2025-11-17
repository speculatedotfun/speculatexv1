'use client';
import { motion } from 'framer-motion';

interface PositionTabProps {
  isConnected: boolean;
  yesBalance: string;
  noBalance: string;
  priceYes: number;
  priceNo: number;
}

export function PositionTab({
  isConnected,
  yesBalance,
  noBalance,
  priceYes,
  priceNo,
}: PositionTabProps) {
  if (!isConnected) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-gradient-to-br from-[#14B8A6]/10 to-[#14B8A6]/5 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#14B8A6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <p className="text-gray-500 font-semibold">Connect wallet to view your positions</p>
      </div>
    );
  }

  if (parseFloat(yesBalance) === 0 && parseFloat(noBalance) === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">📊</div>
        <p className="text-gray-500 font-semibold">No positions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {parseFloat(yesBalance) > 0 && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-2xl border-2 border-green-200 shadow-lg"
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-sm font-bold text-green-600 mb-2 uppercase tracking-wide">YES Position</div>
              <div className="text-3xl font-black text-green-800">{parseFloat(yesBalance).toFixed(4)} shares</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600 mb-1 font-semibold">Value</div>
              <div className="text-2xl font-black text-gray-900">
                ${(parseFloat(yesBalance) * priceYes).toFixed(2)}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-green-200 text-xs text-gray-600">
            <div className="flex justify-between">
              <span className="font-semibold">Price per share:</span>
              <span className="font-bold">${priceYes.toFixed(4)}</span>
            </div>
          </div>
        </motion.div>
      )}
      {parseFloat(noBalance) > 0 && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="p-6 bg-gradient-to-br from-red-50 to-red-100 rounded-2xl border-2 border-red-200 shadow-lg"
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-sm font-bold text-red-600 mb-2 uppercase tracking-wide">NO Position</div>
              <div className="text-3xl font-black text-red-800">{parseFloat(noBalance).toFixed(4)} shares</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600 mb-1 font-semibold">Value</div>
              <div className="text-2xl font-black text-gray-900">
                ${(parseFloat(noBalance) * priceNo).toFixed(2)}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-red-200 text-xs text-gray-600">
            <div className="flex justify-between">
              <span className="font-semibold">Price per share:</span>
              <span className="font-bold">${priceNo.toFixed(4)}</span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}




