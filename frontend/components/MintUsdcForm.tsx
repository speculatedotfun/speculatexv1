'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { addresses } from '@/lib/contracts';
import { usdcAbi } from '@/lib/abis';

export default function MintUsdcForm() {
  const { address } = useAccount();
  const [mintAmount, setMintAmount] = useState('1000');
  const [userBalance, setUserBalance] = useState('0');
  
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Get user's USDC balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: addresses.usdc,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!(address && addresses.usdc),
      // Refetch while transaction is confirming
      refetchInterval: (isConfirming || isPending) ? 2000 : false,
    },
  });

  useEffect(() => {
    if (balance) {
      setUserBalance(formatUnits(balance as bigint, 6));
    }
  }, [balance]);

  useEffect(() => {
    if (isSuccess) {
      // Small delay to ensure blockchain state is updated, then refetch
      const timeoutId = setTimeout(() => {
        refetchBalance();
      }, 1000);
      
      alert('USDC minted successfully!');
      setMintAmount('1000');
      
      return () => clearTimeout(timeoutId);
    }
  }, [isSuccess, refetchBalance]);

  useEffect(() => {
    if (error) {
      console.error('Error minting USDC:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      alert(`Failed to mint USDC: ${errorMessage}`);
    }
  }, [error]);

  const handleMint = async () => {
    if (!mintAmount) {
      alert('Please enter an amount');
      return;
    }

    if (!address) {
      alert('Please connect your wallet');
      return;
    }

    if (!addresses.usdc || addresses.usdc === '0x0000000000000000000000000000000000000000') {
      alert('USDC address not configured');
      return;
    }

    try {
      const amount = parseUnits(mintAmount, 6);
      console.log('Minting USDC:', { 
        contractAddress: addresses.usdc, 
        amount: amount.toString(), 
        recipient: address,
        decimals: 6
      });
      
      // writeContract triggers the transaction
      // Errors are handled via the error state from useWriteContract hook
      writeContract({
        address: addresses.usdc,
        abi: usdcAbi,
        functionName: 'mint',
        args: [address, amount],
      });
      
      console.log('Mint transaction initiated');
    } catch (error: any) {
      console.error('Error in handleMint:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      alert(`Failed to mint USDC: ${errorMessage}`);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Mint Test USDC</h3>
      
      {address && (
        <div className="mb-4">
          <p className="text-sm text-gray-600">Your Balance:</p>
          <p className="text-2xl font-bold text-green-600">{parseFloat(userBalance).toLocaleString()} USDC</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount to Mint (USDC)
          </label>
          <input
            type="number"
            value={mintAmount}
            onChange={(e) => setMintAmount(e.target.value)}
            min="1"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="1000"
          />
        </div>

        <button
          onClick={handleMint}
          disabled={isPending || isConfirming || !address}
          className="w-full rounded-md bg-purple-600 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(isPending || isConfirming) ? 'Minting USDC...' : 'Mint USDC'}
        </button>

        {hash && (
          <p className="text-xs text-gray-500 text-center">
            Transaction: {hash.slice(0, 10)}...{hash.slice(-8)}
          </p>
        )}

        {error && (
          <p className="text-xs text-red-600 text-center mt-2">
            Error: {error.message || 'Transaction failed'}
          </p>
        )}

        {!address && (
          <p className="text-sm text-gray-500 text-center">Connect wallet to mint USDC</p>
        )}
      </div>
    </div>
  );
}

