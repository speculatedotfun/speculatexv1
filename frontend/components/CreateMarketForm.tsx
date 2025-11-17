'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  usePublicClient,
} from 'wagmi';
import { parseUnits, keccak256, stringToBytes, decodeEventLog } from 'viem';
import { addresses } from '@/lib/contracts';
import { coreAbi, usdcAbi } from '@/lib/abis';

interface CreateMarketFormProps {
  standalone?: boolean;
}

export default function CreateMarketForm({ standalone = false }: CreateMarketFormProps = { standalone: false }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Crypto');
  const [resolutionDate, setResolutionDate] = useState('');
  const [initUsdc, setInitUsdc] = useState('1000');

  const [oracleType, setOracleType] = useState<'none' | 'chainlink'>('none');
  const [priceFeedSymbol, setPriceFeedSymbol] = useState('BTC/USD');
  const [targetValue, setTargetValue] = useState('');
  const [comparison, setComparison] = useState<'above' | 'below' | 'equals'>('above');
  const [customOracle, setCustomOracle] = useState('');

  const [yesName, setYesName] = useState('');
  const [yesSymbol, setYesSymbol] = useState('');
  const [noName, setNoName] = useState('');
  const [noSymbol, setNoSymbol] = useState('');

  const { data: hash, writeContractAsync, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const {
    data: approvalHash,
    writeContractAsync: writeApproveAsync,
    isPending: isApproving,
  } = useWriteContract();
  const { isLoading: isApprovalConfirming, isSuccess: isApprovalSuccess } = useWaitForTransactionReceipt({ hash: approvalHash });

  const { data: currentAllowance } = useReadContract({
    address: addresses.usdc,
    abi: usdcAbi,
    functionName: 'allowance',
    args: address && addresses.core ? [address, addresses.core] : undefined,
    query: {
      enabled: !!(address && addresses.usdc && addresses.core),
      refetchInterval: 4000,
    },
  });

  const { data: usdcBalance } = useReadContract({
    address: addresses.usdc,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 4000,
    },
  });

  const [needsApproval, setNeedsApproval] = useState(false);
  const [isApprovingState, setIsApprovingState] = useState(false);

useEffect(() => {
  if (!question) return;
  const shortId = question.replace(/[^a-zA-Z0-9]/g, '').substring(0, 16).toUpperCase();
  setYesName(prev => (prev ? prev : `${shortId} YES`));
  setYesSymbol(prev => (prev ? prev : `${shortId}-YES`));
  setNoName(prev => (prev ? prev : `${shortId} NO`));
  setNoSymbol(prev => (prev ? prev : `${shortId}-NO`));
}, [question]);

  useEffect(() => {
    if (address && addresses.core && currentAllowance !== undefined) {
      const requiredAmount = parseUnits(initUsdc || '0', 6);
      setNeedsApproval((currentAllowance as bigint) < requiredAmount);
    } else {
      setNeedsApproval(false);
    }
  }, [address, currentAllowance, initUsdc]);

  useEffect(() => {
    if (isSuccess && !isApprovingState) {
      alert('✅ Market created successfully!');
      window.location.reload();
    }
  }, [isSuccess, isApprovingState]);

  const handleApprove = async () => {
    if (!address || !addresses.core) return;
    setIsApprovingState(true);
    try {
      const amount = parseUnits(initUsdc || '1000', 6);
      const tx = await writeApproveAsync({
        address: addresses.usdc,
        abi: usdcAbi,
        functionName: 'approve',
        args: [addresses.core, amount],
      });
      console.log('approve transaction submitted', tx);
    } catch (err: any) {
      alert(`Approval failed: ${err.message || 'Unknown error'}`);
      setIsApprovingState(false);
    }
  };

  useEffect(() => {
    if (isApprovalSuccess) {
      setIsApprovingState(false);
      setNeedsApproval(false);
    }
  }, [isApprovalSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address) return alert('Please connect your wallet');
    if (!question) return alert('Enter question');
    if (!resolutionDate) return alert('Select resolution date');
    if (needsApproval) return alert('Approve USDC first');

    const initUsdcE6 = parseUnits(initUsdc, 6);
    const expiry = Math.floor(new Date(resolutionDate).getTime() / 1000);
    const targetValueBigInt = oracleType === 'chainlink' && targetValue ? parseUnits(targetValue, 8) : 0n;
    const comparisonEnum = comparison === 'above' ? 0 : comparison === 'below' ? 1 : 2;

    const FEED_ADDRESSES: Record<string, string> = {
      'BTC/USD': '0x5741306c21795FdCBb9b265Ea0255F499DFe515C',
      'ETH/USD': '0x9326BFA02ADD2366b30bacB125260Af641031331',
      'BNB/USD': '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE',
    };

    const oracleAddress = oracleType === 'chainlink'
      ? (customOracle || FEED_ADDRESSES[priceFeedSymbol] || '0x0000000000000000000000000000000000000000')
      : '0x0000000000000000000000000000000000000000';

    const feedId = (oracleType === 'chainlink' && priceFeedSymbol
      ? keccak256(stringToBytes(priceFeedSymbol))
      : '0x0000000000000000000000000000000000000000000000000000000000000000') as `0x${string}`;

    try {
      console.log('Submitting createMarket with args:', {
        question,
        yesName,
        yesSymbol,
        noName,
        noSymbol,
        initUsdcE6: initUsdcE6.toString(),
        expiry,
        oracleAddress,
        priceFeedId: feedId,
        targetValue: targetValueBigInt.toString(),
        comparisonEnum,
      });
      const txHash = await writeContractAsync({
        address: addresses.core,
        abi: coreAbi,
        functionName: 'createMarket',
        args: [
          question,
          yesName,
          yesSymbol,
          noName,
          noSymbol,
          initUsdcE6,
          BigInt(expiry),
          oracleAddress,
          feedId,
          targetValueBigInt,
          comparisonEnum,
        ],
      });
      console.log('createMarket transaction submitted, hash:', txHash);

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
        
        // Get block timestamp to store createdAt immediately
        if (receipt.blockNumber) {
          try {
            const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
            if (block?.timestamp) {
              // Extract market ID from MarketCreated event logs
              const marketCreatedLog = receipt.logs.find((log: any) => {
                try {
                  const decoded = decodeEventLog({
                    abi: coreAbi,
                    data: log.data,
                    topics: log.topics,
                  }) as any;
                  return decoded.eventName === 'MarketCreated';
                } catch {
                  return false;
                }
              });
              
              if (marketCreatedLog) {
                try {
                  const decoded = decodeEventLog({
                    abi: coreAbi,
                    data: marketCreatedLog.data,
                    topics: marketCreatedLog.topics,
                  }) as { eventName: string; args: Record<string, unknown> };
                  
                  if (decoded.eventName === 'MarketCreated' && decoded.args?.id) {
                    const marketId = Number(decoded.args.id);
                    const createdAtTimestamp = Number(block.timestamp);
                    
                    // Store in localStorage for immediate access when navigating to market page
                    const storedData = {
                      marketId,
                      createdAt: createdAtTimestamp,
                      txHash: receipt.transactionHash,
                    };
                    
                    const existingMarkets = JSON.parse(
                      localStorage.getItem('newlyCreatedMarkets') || '[]'
                    );
                    const filtered = existingMarkets.filter((m: any) => m.marketId !== marketId);
                    localStorage.setItem(
                      'newlyCreatedMarkets',
                      JSON.stringify([...filtered, storedData])
                    );
                    
                    console.log('[CreateMarket] Stored market creation timestamp:', storedData);
                  }
                } catch (error) {
                  console.warn('[CreateMarket] Failed to decode MarketCreated event:', error);
                }
              }
            }
          } catch (error) {
            console.warn('[CreateMarket] Failed to get block timestamp:', error);
          }
        }
      }
    } catch (err: any) {
      console.error('createMarket error', err);
      alert(`Failed: ${err.message || 'Unknown error'}`);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="font-bold block mb-2">Market Question *</label>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Will BTC reach $100K by 2026?"
          className="w-full border rounded-lg px-4 py-3"
          required
        />
      </div>

      <div>
        <label className="font-bold block mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add details or criteria..."
          className="w-full border rounded-lg px-4 py-3"
        />
      </div>

      <div>
        <label className="font-bold block mb-2">Category</label>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Crypto"
          className="w-full border rounded-lg px-4 py-3"
        />
      </div>

      <div>
        <label className="font-bold block mb-2">Resolution Date *</label>
        <input
          type="datetime-local"
          value={resolutionDate}
          onChange={(e) => setResolutionDate(e.target.value)}
          className="w-full border rounded-lg px-4 py-3"
          required
        />
      </div>

      <div>
        <label className="font-bold block mb-2">Initial Liquidity (USDC)</label>
        <input
          type="number"
          value={initUsdc}
          onChange={(e) => setInitUsdc(e.target.value)}
          className="w-full border rounded-lg px-4 py-3"
          required
        />
        <p className="text-xs text-gray-600 mt-1">
          Sets the depth of the market; more USDC means flatter prices.
        </p>
      </div>

      <div>
        <label className="font-bold block mb-2">Resolution Type *</label>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name="oracleType"
              value="none"
              checked={oracleType === 'none'}
              onChange={() => setOracleType('none')}
            />
            Manual Resolution
          </label>
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name="oracleType"
              value="chainlink"
              checked={oracleType === 'chainlink'}
              onChange={() => setOracleType('chainlink')}
            />
            Chainlink Auto-Resolution
          </label>
        </div>
      </div>

      {oracleType === 'chainlink' && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-4">
          <h3 className="font-semibold text-gray-900">Chainlink Configuration</h3>
          <div>
            <label className="block mb-1">Price Feed Symbol *</label>
            <select
              value={priceFeedSymbol}
              onChange={(e) => setPriceFeedSymbol(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="BTC/USD">BTC/USD</option>
              <option value="ETH/USD">ETH/USD</option>
              <option value="BNB/USD">BNB/USD</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-1">Target Value *</label>
              <input
                type="number"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block mb-1">Comparison *</label>
              <select
                value={comparison}
                onChange={(e) => setComparison(e.target.value as 'above' | 'below' | 'equals')}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="above">Above</option>
                <option value="below">Below</option>
                <option value="equals">Equals</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block mb-1">Custom Feed Address (optional)</label>
            <input
              value={customOracle}
              onChange={(e) => setCustomOracle(e.target.value)}
              placeholder="0x..."
              className="w-full border rounded-lg px-3 py-2"
            />
            <p className="text-xs text-gray-500">Leave blank to use the default address for the selected feed.</p>
          </div>
        </div>
      )}

      <div className="p-4 bg-gray-50 rounded-lg border space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label>YES Token Name</label>
            <input
              value={yesName}
              onChange={(e) => setYesName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label>YES Token Symbol</label>
            <input
              value={yesSymbol}
              onChange={(e) => setYesSymbol(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label>NO Token Name</label>
            <input
              value={noName}
              onChange={(e) => setNoName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label>NO Token Symbol</label>
            <input
              value={noSymbol}
              onChange={(e) => setNoSymbol(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {needsApproval && (
        <div className="p-4 bg-red-50 border rounded-lg">
          <p className="text-red-800 font-semibold mb-2">Approval Required</p>
          <button
            type="button"
            onClick={handleApprove}
            disabled={isApproving || isApprovalConfirming}
            className="w-full bg-red-600 hover:bg-red-500 text-white rounded-lg py-3 font-semibold disabled:opacity-50"
          >
            {isApproving || isApprovalConfirming ? 'Approving...' : 'Approve USDC'}
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || isConfirming || needsApproval}
        className="w-full bg-teal-500 hover:bg-teal-600 text-white rounded-lg py-3 font-semibold disabled:opacity-50"
      >
        {isPending || isConfirming ? 'Creating...' : 'Create Market'}
      </button>
    </form>
  );

  if (standalone) {
    return (
      <div className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-4xl mx-auto px-4">
          <Link href="/" className="text-teal-600 hover:text-teal-500 font-medium mb-6 inline-block">
            ← Back to Home
          </Link>
          <div className="bg-white p-8 rounded-xl shadow border">
            <h1 className="text-3xl font-bold mb-6">Create Market</h1>
            {formContent}
          </div>
        </div>
      </div>
    );
  }

  return <div className="bg-white p-6 rounded-lg shadow">{formContent}</div>;
}
