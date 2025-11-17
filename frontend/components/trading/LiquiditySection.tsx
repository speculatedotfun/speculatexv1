import { ChangeEvent } from 'react';
import { formatUnits } from 'viem';

interface LiquiditySectionProps {
  vaultBase: number;
  lpShareFloat: number;
  userSharePct: number;
  pendingFeesFloat: number;
  pendingResidualFloat: number;
  lpFeePoolFloat: number;
  isResolved: boolean;
  addLiquidityAmount: string;
  setAddLiquidityAmount: (value: string) => void;
  liquidityRegex: RegExp;
  formatLiquidity: (num: number) => string;
  maxBuyAmount: number;
  canAddLiquidity: boolean;
  isLpProcessing: boolean;
  isBusy: boolean;
  isTradeable: boolean;
  pendingLpAction: null | 'add' | 'claim';
  pendingLpFeesValue: bigint;
  pendingLpResidualValue: bigint;
  handleAddLiquidity: () => void;
  handleClaimAllLp: () => void;
}

export function LiquiditySection({
  vaultBase,
  lpShareFloat,
  userSharePct,
  pendingFeesFloat,
  pendingResidualFloat,
  lpFeePoolFloat,
  isResolved,
  addLiquidityAmount,
  setAddLiquidityAmount,
  liquidityRegex,
  formatLiquidity,
  maxBuyAmount,
  canAddLiquidity,
  isLpProcessing,
  isBusy,
  isTradeable,
  pendingLpAction,
  pendingLpFeesValue,
  pendingLpResidualValue,
  handleAddLiquidity,
  handleClaimAllLp,
}: LiquiditySectionProps) {
  return (
    <div className="pt-6 border-t border-gray-200 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Provide Liquidity</h3>
        <span className="text-xs font-semibold text-gray-500">
          Vault: ${vaultBase.toFixed(2)}
        </span>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm font-medium text-gray-700">
        <div className="flex justify-between">
          <span>Your LP shares</span>
          <span>{lpShareFloat.toFixed(2)} USDC ({userSharePct.toFixed(2)}%)</span>
        </div>
        <div className="flex justify-between">
          <span>Pending fees</span>
          <span>${pendingFeesFloat.toFixed(4)}</span>
        </div>
        {isResolved && (
          <div className="flex justify-between">
            <span>Pending residual</span>
            <span>${pendingResidualFloat.toFixed(4)}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-500">
          <span>Fee pool</span>
          <span>${lpFeePoolFloat.toFixed(2)}</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-gray-600">
            Add liquidity (USDC)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              pattern={liquidityRegex.source}
              value={addLiquidityAmount}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const val = e.target.value;
                if (!val) {
                  setAddLiquidityAmount('');
                  return;
                }
                if (!liquidityRegex.test(val)) return;
                if (val === '.' || val.endsWith('.')) {
                  setAddLiquidityAmount(val);
                  return;
                }
                const num = parseFloat(val);
                if (!Number.isFinite(num)) return;
                if (num > maxBuyAmount) return;
                setAddLiquidityAmount(formatLiquidity(num));
              }}
              placeholder="0.0"
              className="flex-1 rounded-lg border px-4 py-2 font-semibold focus:ring-2 focus:ring-green-500"
              disabled={!isTradeable || isBusy || isLpProcessing}
            />
            <button
              onClick={() => {
                const maxString = Number.isFinite(maxBuyAmount) ? formatLiquidity(maxBuyAmount) : '0';
                setAddLiquidityAmount(maxString);
              }}
              className="px-3 py-2 bg-green-50 hover:bg-green-100 rounded-lg text-sm font-bold text-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!isTradeable || isBusy || isLpProcessing}
            >
              Max
            </button>
          </div>
          <button
            onClick={handleAddLiquidity}
            disabled={!canAddLiquidity || isLpProcessing || isBusy || !isTradeable}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pendingLpAction === 'add' && isLpProcessing ? 'Adding…' : 'Add Liquidity'}
          </button>
        </div>
      </div>

      <button
        onClick={handleClaimAllLp}
        disabled={(pendingLpFeesValue === 0n && pendingLpResidualValue === 0n) || isLpProcessing}
        className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pendingLpAction === 'claim' && isLpProcessing ? 'Claiming…' : 'Claim All LP Rewards'}
      </button>
    </div>
  );
}




