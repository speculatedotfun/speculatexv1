'use client';
import { motion } from 'framer-motion';
import type { TransactionRow } from '@/lib/marketTransformers';

interface TransactionsTabProps {
  transactions: TransactionRow[];
  loading: boolean;
}

export function TransactionsTab({ transactions, loading }: TransactionsTabProps) {
  if (loading) {
    return (
      <div className="text-center py-16">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="inline-block w-12 h-12 border-4 border-[#14B8A6] border-t-transparent rounded-full"
        />
        <p className="mt-4 text-gray-500 font-semibold">Loading transactions...</p>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">📜</div>
        <p className="text-gray-500 font-semibold">No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.map((tx, index) => (
        <motion.div
          key={tx.id}
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: index * 0.05 }}
          className="flex items-center justify-between p-5 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all border border-gray-200 hover:border-[#14B8A6]"
        >
          <div className="flex items-center gap-4 flex-1">
            <div className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase shadow-md ${
              tx.type === 'BuyYes' || tx.type === 'BuyNo'
                ? 'bg-gradient-to-r from-green-400 to-green-500 text-white'
                : 'bg-gradient-to-r from-red-400 to-red-500 text-white'
            }`}>
              {tx.type}
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">
                {tx.user.slice(0, 6)}...{tx.user.slice(-4)}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(tx.timestamp * 1000).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="text-right mr-4">
            <div className="text-sm font-bold text-gray-900">
              {tx.amount} → {tx.output}
            </div>
            <div className="text-xs text-gray-500">
              Price: ${tx.price}
            </div>
          </div>
          <a
            href={`https://testnet.bscscan.com/tx/${tx.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#14B8A6] hover:text-[#0D9488] font-bold text-sm flex items-center gap-1"
          >
            View
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </motion.div>
      ))}
    </div>
  );
}




