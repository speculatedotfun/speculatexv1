import { formatPrice } from '@/lib/tradingUtils';

interface TradePreviewProps {
  amount: string;
  tradeMode: 'buy' | 'sell';
  currentPrice: number;
  newPrice: number;
  shares: number;
  avgPrice: number;
  costUsd: number;
  feeUsd: number;
  feePercent: number;
  maxProfit: number;
  maxProfitPct: number;
  maxPayout: number;
  gasEstimate: bigint | null;
  feeTreasuryBps: number;
  feeVaultBps: number;
  feeLpBps: number;
  tradeMultiple: number;
}

export function TradePreview({
  amount,
  tradeMode,
  currentPrice,
  newPrice,
  shares,
  avgPrice,
  costUsd,
  feeUsd,
  feePercent,
  maxProfit,
  maxProfitPct,
  maxPayout,
  gasEstimate,
  feeTreasuryBps,
  feeVaultBps,
  feeLpBps,
  tradeMultiple,
}: TradePreviewProps) {
  if (!amount || parseFloat(amount) <= 0) return null;

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
      <div className="text-xs text-gray-500 text-center">Preview (simulated - actual may vary)</div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Current price</span>
        <span className="font-bold">{formatPrice(currentPrice)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">New price</span>
        <span className="font-bold">{formatPrice(newPrice)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Shares</span>
        <span className="font-bold">{shares.toFixed(4)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Avg. entry (incl. fees)</span>
        <span className="font-bold">${avgPrice.toFixed(3)}</span>
      </div>
      {tradeMode === 'buy' && (
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Cost (incl. fees)</span>
          <span className="font-bold">${costUsd.toFixed(2)}</span>
        </div>
      )}
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">
          Fee
          {tradeMode === 'buy' && (
            <span
              title={`Treasury ${(feeTreasuryBps / 100).toFixed(2)}% • Vault ${(feeVaultBps / 100).toFixed(2)}% • LP ${(feeLpBps / 100).toFixed(2)}%`}
              aria-label={`Fee breakdown: Treasury ${(feeTreasuryBps / 100).toFixed(2)} percent, Vault ${(feeVaultBps / 100).toFixed(2)} percent, LP ${(feeLpBps / 100).toFixed(2)} percent`}
              className="ml-2 underline decoration-dotted cursor-help text-xs font-normal align-middle"
            >
              details
            </span>
          )}
          {tradeMode === 'sell' && (
            <span className="ml-2 text-xs font-normal text-gray-500">(fee-free sell)</span>
          )}
        </span>
        <span className="font-bold">
          {feePercent.toFixed(2)}%
          {feeUsd > 0 ? ` ($${feeUsd.toFixed(2)})` : ''}
        </span>
      </div>
      {tradeMode === 'buy' ? (
        <>
          {tradeMultiple > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Multiple</span>
              <span className="font-bold">{tradeMultiple.toFixed(2)}×</span>
            </div>
          )}
          <div className="flex justify-between text-green-600 font-bold text-sm">
            <span className="text-gray-600">Max profit</span>
            <span>${maxProfit.toFixed(2)} (+{maxProfitPct.toFixed(1)}%)</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Max payout</span>
            <span className="font-bold">${maxPayout.toFixed(2)}</span>
          </div>
        </>
      ) : (
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Proceeds</span>
          <span className="font-bold">${costUsd.toFixed(2)}</span>
        </div>
      )}
      {gasEstimate && (
        <div className="flex justify-between text-sm text-gray-500">
          <span>Est. gas</span>
          <span>{gasEstimate.toString()} wei</span>
        </div>
      )}
    </div>
  );
}




