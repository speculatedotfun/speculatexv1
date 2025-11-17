'use client';

import { useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { addresses } from '@/lib/contracts';
import { coreAbi as SpeculateCoreABI } from '@/lib/abis';
import { formatUnits } from 'viem';

interface Market {
  id: number;
  question: string;
  status: 'active' | 'resolved';
  vault: number;
  residual: number;
  yesToken: `0x${string}`;
  noToken: `0x${string}`;
  yesWins: boolean;
  isResolved: boolean;
  winningSupply: bigint;
}

interface AdminMarketManagerProps {
  markets: Market[];
}

export default function AdminMarketManager({ markets }: AdminMarketManagerProps) {
  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const handleResolve = async (marketId: number, yesWins: boolean) => {
    try {
      writeContract({
        address: addresses.core,
        abi: SpeculateCoreABI,
        functionName: 'resolveMarket',
        args: [BigInt(marketId), yesWins],
      });
    } catch (error) {
      console.error('Error resolving market:', error);
      alert('Failed to resolve market');
    }
  };

  const handleFinalizeResidual = async (marketId: number) => {
    try {
      writeContract({
        address: addresses.core,
        abi: SpeculateCoreABI,
        functionName: 'finalizeResidual',
        args: [BigInt(marketId)],
      });
    } catch (error) {
      console.error('Error finalizing residual:', error);
      alert('Failed to finalize residual');
    }
  };

  useEffect(() => {
    if (isSuccess) {
      window.location.reload();
    }
  }, [isSuccess]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Manage Markets</h2>
      </div>

      <div className="space-y-4">
        {markets.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No markets yet</p>
        ) : (
          markets.map((market) => {
            const isResolved = market.status === 'resolved';
            const winnersRemaining = market.winningSupply > 0n;
            const canFinalizeResidual = isResolved && market.vault > 0.000001 && !winnersRemaining;
            const winningSupplyDisplay = Number(formatUnits(market.winningSupply, 18));
            const finalizeDisabled = !isResolved || winnersRemaining || market.vault <= 0.000001 || isPending || isConfirming;
            return (
              <div
                key={market.id}
                className="rounded-md border border-gray-200 p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{market.question}</h3>
                    <p className="text-sm text-gray-500">
                      Status: {market.status} • Vault: ${market.vault.toFixed(2)} • Residual pot: ${market.residual.toFixed(2)}
                    </p>
                    {isResolved && (
                      <p className="text-xs text-gray-500 mt-1">
                        Winning side: {market.yesWins ? 'YES' : 'NO'} • Winning supply remaining: {winningSupplyDisplay.toFixed(4)}
                      </p>
                    )}
                    {isResolved && winnersRemaining && (
                      <p className="text-xs text-amber-600 mt-1">
                        Winning tokens still exist. Ask holders to redeem before finalizing residual.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleResolve(market.id, true)}
                      disabled={isResolved || isPending || isConfirming}
                      className="rounded-md bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-500 disabled:opacity-50"
                      title="Resolve as YES wins"
                    >
                      Resolve YES
                    </button>
                    <button
                      onClick={() => handleResolve(market.id, false)}
                      disabled={isResolved || isPending || isConfirming}
                      className="rounded-md bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500 disabled:opacity-50"
                      title="Resolve as NO wins"
                    >
                      Resolve NO
                    </button>
                    <button
                      onClick={() => handleFinalizeResidual(market.id)}
                      disabled={finalizeDisabled}
                      className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
                      title="Finalize residual vault funds for LPs"
                    >
                      Finalize Residual
                    </button>
                  </div>
                </div>
                {isResolved && !winnersRemaining && market.vault > 0.000001 ? (
                  <p className="mt-2 text-xs text-blue-600">
                    This market is resolved with ${market.vault.toFixed(2)} remaining in the vault. Finalize residual to move funds into the LP residual pot.
                  </p>
                ) : market.residual > 0 ? (
                  <p className="mt-2 text-xs text-gray-500">
                    Residual finalized. LPs can claim ${market.residual.toFixed(2)} via the claim residual flow.
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
