'use client';
import { useState, useEffect, ChangeEvent, useMemo, useCallback } from 'react';
import { useAccount, useWriteContract, useReadContract, usePublicClient, useBlockNumber } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { addresses } from '@/lib/contracts';
import { coreAbi, usdcAbi, positionTokenAbi } from '@/lib/abis';
import { useToast } from '@/components/ui/toast';
import { clamp, formatBalanceDisplay, toBigIntSafe } from '@/lib/tradingUtils';
import { mul, div, exp2, log2, ln, costFunction, spotPriceYesE18, findSharesOut, simulateBuyChunk } from '@/lib/lmsrMath';

const SCALE = 10n ** 18n;
const USDC_TO_E18 = 10n ** 12n;
const LN2 = 693147180559945309n;
const LOG2_E = 1442695040888963407n;
const TWO_OVER_LN2 = (2n * SCALE * SCALE) / LN2;
const MAX_SEARCH_ITERATIONS = 60;
const SLIPPAGE_BPS = 50n; // 0.50% slippage buffer
const SAFETY_MARGIN_BPS = 9800n; // 98% of cap to stay under jump limit
const MIN_USDC_OUT_E6 = 1_000n; // $0.001

const MAX_UINT256 = (1n << 256n) - 1n;
type PublicClientType = ReturnType<typeof usePublicClient>;
type WriteContractAsyncFn = ReturnType<typeof useWriteContract>['writeContractAsync'];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForReceipt(publicClient: PublicClientType, hash: `0x${string}`) {
  if (!publicClient) return;
  await publicClient.waitForTransactionReceipt({ hash });
}

async function ensureAllowance({
  publicClient,
  owner,
  tokenAddress,
  spender,
  required,
  currentAllowance,
  writeContractAsync,
  setBusyLabel,
  approvalLabel,
  abi,
}: {
  publicClient: PublicClientType;
  owner: `0x${string}`;
  tokenAddress: `0x${string}`;
  spender: `0x${string}`;
  required: bigint;
  currentAllowance?: bigint;
  writeContractAsync: WriteContractAsyncFn;
  setBusyLabel: (label: string) => void;
  approvalLabel: string;
  abi: typeof usdcAbi | typeof positionTokenAbi;
}) {
  if (!owner || required <= 0n) return;
  const hasEnough = currentAllowance !== undefined && currentAllowance >= required;
  if (hasEnough) return;

  setBusyLabel(approvalLabel);
  const approveHash = await writeContractAsync({
    address: tokenAddress,
    abi,
    functionName: 'approve',
    args: [spender, MAX_UINT256],
  });

  try {
    await waitForReceipt(publicClient, approveHash as `0x${string}`);
  } catch (e) {
    console.error('Allowance approval receipt wait failed', e);
  }
}

interface TradingCardProps {
  marketId: number;
  // Centralized market data
  marketData?: {
    currentPrices: { yes: number; no: number };
    instantPrices: { yes: number; no: number };
    marketState: any;
  };
  // Advanced real-time features (optional)
  optimisticManager?: any;
  pricePredictor?: any;
  tradeBatchProcessor?: any;
  connectionHealth?: any;
}

export default function TradingCard({
  marketId,
  marketData,
  optimisticManager,
  pricePredictor,
  tradeBatchProcessor,
  connectionHealth
}: TradingCardProps) {
  const { address } = useAccount();
  const marketIdBI = useMemo(() => BigInt(marketId), [marketId]);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [side, setSide] = useState<'yes' | 'no'>('yes');
  const [amount, setAmount] = useState('');
  const [gasEstimate, setGasEstimate] = useState<bigint | null>(null);
  const [yesBalance, setYesBalance] = useState('0');
  const [noBalance, setNoBalance] = useState('0');
  const [usdcBalance, setUsdcBalance] = useState('0');
  const [yesBalanceRaw, setYesBalanceRaw] = useState<bigint>(0n);
  const [noBalanceRaw, setNoBalanceRaw] = useState<bigint>(0n);
  const [usdcBalanceRaw, setUsdcBalanceRaw] = useState<bigint>(0n);

  const amountDecimals = tradeMode === 'buy' ? 6 : 6;
  const amountRegex = useMemo(() => new RegExp(`^\\d*(?:\\.\\d{0,${amountDecimals}})?$`), [amountDecimals]);
  const formatAmount = useCallback((num: number) => {
    if (!Number.isFinite(num)) return '';
    return num.toLocaleString(undefined, {
      maximumFractionDigits: amountDecimals,
      useGrouping: false,
    });
  }, [amountDecimals]);

  const liquidityDecimals = 6;
  const liquidityRegex = useMemo(() => new RegExp(`^\\d*(?:\\.\\d{0,${liquidityDecimals}})?$`), []);
  const formatLiquidity = useCallback((num: number) => {
    if (!Number.isFinite(num)) return '';
    return num.toLocaleString(undefined, {
      maximumFractionDigits: liquidityDecimals,
      useGrouping: false,
    });
  }, []);

  const [currentPrice, setCurrentPrice] = useState(0);
  const [newPrice, setNewPrice] = useState(0);
  const [shares, setShares] = useState(0);
  const [avgPrice, setAvgPrice] = useState(0);
  const [costUsd, setCostUsd] = useState(0);
  const [feeUsd, setFeeUsd] = useState(0);
  const [feePercent, setFeePercent] = useState(0);
  const [maxProfit, setMaxProfit] = useState(0);
  const [maxProfitPct, setMaxProfitPct] = useState(0);
  const [maxPayout, setMaxPayout] = useState(0);

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const { pushToast } = useToast();

  const [pendingTrade, setPendingTrade] = useState(false);
  const [addLiquidityAmount, setAddLiquidityAmount] = useState('');
  const [pendingLpAction, setPendingLpAction] = useState<null | 'add' | 'claim'>(null);
  const [showSplitConfirm, setShowSplitConfirm] = useState(false);
  const [pendingSplitAmount, setPendingSplitAmount] = useState<bigint>(0n);
  const [busyLabel, setBusyLabel] = useState('');
  const isBusy = pendingTrade || pendingLpAction !== null;

  const { data: contractData } = useReadContract({
    address: addresses.core,
    abi: coreAbi,
    functionName: 'markets',
    args: [marketIdBI],
    query: { enabled: marketId >= 0 },
  }) as any;

  const marketStateQuery = useReadContract({
    address: addresses.core,
    abi: coreAbi,
    functionName: 'getMarketState',
    args: [marketIdBI],
    query: { enabled: marketId >= 0 },
  });
  const marketState = marketStateQuery.data as (readonly [bigint, bigint, bigint, bigint, bigint]) | undefined;
  const refetchMarketState = marketStateQuery.refetch;

  const isObject = contractData && typeof contractData === 'object' && !Array.isArray(contractData);
  const yesTokenAddress = isObject ? contractData.yes : contractData?.[0];
  const noTokenAddress = isObject ? contractData.no : contractData?.[1];
  const qYes = BigInt(marketState?.[0] ?? (isObject ? contractData.qYes ?? 0n : contractData?.[2] ?? 0n));
  const qNo = BigInt(marketState?.[1] ?? (isObject ? contractData.qNo ?? 0n : contractData?.[3] ?? 0n));
  const vaultE6 = BigInt(marketState?.[2] ?? (isObject ? contractData.usdcVault ?? 0n : contractData?.[5] ?? 0n));
  const bE18 = BigInt(marketState?.[3] ?? (isObject ? contractData.bE18 ?? 0n : contractData?.[4] ?? 0n));
  const priceYesE6 = BigInt(marketState?.[4] ?? 0n);
  const feeTreasuryBps = Number(isObject ? (contractData.feeTreasuryBps ?? 0) : (contractData?.[6] ?? 0));
  const feeVaultBps = Number(isObject ? (contractData.feeVaultBps ?? 0) : (contractData?.[7] ?? 0));
  const feeLpBps = Number(isObject ? (contractData.feeLpBps ?? 0) : (contractData?.[8] ?? 0));
  const totalFeeBps = feeTreasuryBps + feeVaultBps + feeLpBps;
  const resolutionRaw = isObject ? contractData.resolution : contractData?.[12];
  const expiryTimestamp = useMemo(() => {
    if (!resolutionRaw) return 0n;
    if (isObject) return toBigIntSafe(resolutionRaw?.expiryTimestamp);
    return toBigIntSafe(resolutionRaw?.[0]);
  }, [resolutionRaw, isObject]);
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const status = Number(isObject ? contractData.status ?? 0 : contractData?.[9] ?? 0);
  const isExpired = expiryTimestamp > 0n && nowSec >= expiryTimestamp;

  const { data: resolutionData } = useReadContract({
    address: addresses.core,
    abi: coreAbi,
    functionName: 'getMarketResolution',
    args: [marketIdBI],
    query: { enabled: marketId >= 0 },
  }) as any;

  const resolution = useMemo(() => {
    if (!resolutionData) return null;
    return {
      expiryTimestamp: Number(resolutionData.expiryTimestamp),
      oracleType: Number(resolutionData.oracleType),
      oracleAddress: resolutionData.oracleAddress,
      targetValue: Number(resolutionData.targetValue),
      comparison: Number(resolutionData.comparison),
      yesWins: resolutionData.yesWins,
      isResolved: resolutionData.isResolved,
    };
  }, [resolutionData]);

  const isResolved = Boolean(resolution?.isResolved);
  const isTradeable = status === 0 && !isResolved && !isExpired;
  const statusLabel = isTradeable ? 'Active' : (isResolved ? 'Resolved' : (isExpired ? 'Expired' : 'Unavailable'));
  const tradeDisabledReason = !isTradeable
    ? isResolved
      ? 'Market is resolved; trading is disabled.'
      : isExpired
        ? 'Market has expired; trading is disabled.'
        : 'Trading is currently disabled.'
    : '';

  const lpSharesResult = useReadContract({
    address: addresses.core,
    abi: coreAbi,
    functionName: 'lpShares',
    args: address ? [marketIdBI, address] : undefined,
    query: { enabled: !!address && marketId >= 0 },
  });
  const lpSharesValue = (lpSharesResult.data as bigint | undefined) ?? 0n;

  const pendingFeesResult = useReadContract({
    address: addresses.core,
    abi: coreAbi,
    functionName: 'pendingLpFees',
    args: address ? [marketIdBI, address] : undefined,
    query: { enabled: !!address && marketId >= 0 },
  });
  const pendingFeesValue = (pendingFeesResult.data as bigint | undefined) ?? 0n;

  const pendingResidualResult = useReadContract({
    address: addresses.core,
    abi: coreAbi,
    functionName: 'pendingLpResidual',
    args: address ? [marketIdBI, address] : undefined,
    query: { enabled: !!address && marketId >= 0 && isResolved },
  });
  const pendingResidualValue = (pendingResidualResult.data as bigint | undefined) ?? 0n;

  const maxJumpQuery = useReadContract({
    address: addresses.core,
    abi: coreAbi,
    functionName: 'maxUsdcBeforeJump',
    args: [marketIdBI, side === 'yes'],
    query: { enabled: marketId >= 0 },
  });
  const maxJumpE6 = (maxJumpQuery.data as bigint | undefined) ?? 0n;
  const refetchMaxJump = maxJumpQuery.refetch;

  const usdcBalQuery = useReadContract({
    address: addresses.usdc,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const usdcBal = usdcBalQuery.data;

  const yesBalQuery = useReadContract({
    address: yesTokenAddress,
    abi: positionTokenAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!yesTokenAddress },
  });
  const yesBal = yesBalQuery.data;

  const noBalQuery = useReadContract({
    address: noTokenAddress,
    abi: positionTokenAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!noTokenAddress },
  });
  const noBal = noBalQuery.data;

  const refetchAll = useCallback(async () => {
    await Promise.allSettled([
      refetchMarketState?.(),
      refetchMaxJump?.(),
      lpSharesResult.refetch?.(),
      pendingFeesResult.refetch?.(),
      pendingResidualResult.refetch?.(),
      usdcBalQuery.refetch?.(),
      yesBalQuery.refetch?.(),
      noBalQuery.refetch?.(),
    ]);
  }, [
    refetchMarketState,
    refetchMaxJump,
    lpSharesResult,
    pendingFeesResult,
    pendingResidualResult,
    usdcBalQuery,
    yesBalQuery,
    noBalQuery,
  ]);

  useEffect(() => {
    if (usdcBal) {
      const raw = usdcBal as bigint;
      setUsdcBalanceRaw(raw);
      setUsdcBalance(formatBalanceDisplay(raw, 6, 2));
    }
    if (yesBal) {
      const raw = yesBal as bigint;
      setYesBalanceRaw(raw);
      setYesBalance(formatBalanceDisplay(raw, 18, 3));
    }
    if (noBal) {
      const raw = noBal as bigint;
      setNoBalanceRaw(raw);
      setNoBalance(formatBalanceDisplay(raw, 18, 3));
    }
  }, [usdcBal, yesBal, noBal]);

  useEffect(() => {
    if (!blockNumber) return;
    void refetchAll();
  }, [blockNumber, refetchAll]);

  useEffect(() => {
    if (!publicClient) return;
    const marketIdBigInt = marketIdBI;
    const matchMarket = (logs: any[]) =>
      logs.some((log) => {
        const id = log?.args?.id;
        if (typeof id === 'bigint') return id === marketIdBigInt;
        if (typeof id === 'number') return BigInt(id) === marketIdBigInt;
        if (typeof id === 'string') return id === marketIdBigInt.toString();
        return false;
      });

    const unwatchBuy = publicClient.watchContractEvent({
      address: addresses.core,
      abi: coreAbi,
      eventName: 'Buy',
      onLogs: (logs) => {
        if (matchMarket(logs)) void refetchAll();
      },
    });
    const unwatchSell = publicClient.watchContractEvent({
      address: addresses.core,
      abi: coreAbi,
      eventName: 'Sell',
      onLogs: (logs) => {
        if (matchMarket(logs)) void refetchAll();
      },
    });
    const unwatchLiquidityAdded = publicClient.watchContractEvent({
      address: addresses.core,
      abi: coreAbi,
      eventName: 'LiquidityAdded',
      onLogs: (logs) => {
        if (matchMarket(logs)) void refetchAll();
      },
    });
    const unwatchResolved = publicClient.watchContractEvent({
      address: addresses.core,
      abi: coreAbi,
      eventName: 'MarketResolved',
      onLogs: (logs) => {
        if (matchMarket(logs)) void refetchAll();
      },
    });
    const unwatchLpFees = publicClient.watchContractEvent({
      address: addresses.core,
      abi: coreAbi,
      eventName: 'LpFeesClaimed',
      onLogs: (logs) => {
        if (matchMarket(logs)) void refetchAll();
      },
    });
    const unwatchLpResidual = publicClient.watchContractEvent({
      address: addresses.core,
      abi: coreAbi,
      eventName: 'LpResidualClaimed',
      onLogs: (logs) => {
        if (matchMarket(logs)) void refetchAll();
      },
    });
    const unwatchRedeemed = publicClient.watchContractEvent({
      address: addresses.core,
      abi: coreAbi,
      eventName: 'Redeemed',
      onLogs: (logs) => {
        if (matchMarket(logs)) void refetchAll();
      },
    });

    return () => {
      unwatchBuy?.();
      unwatchSell?.();
      unwatchLiquidityAdded?.();
      unwatchResolved?.();
      unwatchLpFees?.();
      unwatchLpResidual?.();
      unwatchRedeemed?.();
    };
  }, [publicClient, marketIdBI, refetchAll]);

  const { data: usdcAllowance } = useReadContract({
    address: addresses.usdc,
    abi: usdcAbi,
    functionName: 'allowance',
    args: address && addresses.core ? [address, addresses.core] : undefined,
    query: { enabled: !!address },
  });

  const tokenAddr = tradeMode === 'sell' ? (side === 'yes' ? yesTokenAddress : noTokenAddress) : undefined;
  const { data: tokenAllowance } = useReadContract({
    address: tokenAddr,
    abi: positionTokenAbi,
    functionName: 'allowance',
    args: address && addresses.core ? [address, addresses.core] : undefined,
    query: { enabled: tradeMode === 'sell' && !!tokenAddr && !!address && !!amount },
  });

  const usdcAllowanceValue = usdcAllowance as bigint | undefined;
  const tokenAllowanceValue = tokenAllowance as bigint | undefined;

  const amountBigInt = useMemo(() => {
    if (!amount || parseFloat(amount) <= 0) return 0n;
    try {
      return tradeMode === 'buy'
        ? parseUnits(amount, 6)
        : parseUnits(amount, 18);
    } catch {
      return 0n;
    }
  }, [amount, tradeMode]);

  const canBuy = tradeMode === 'buy' && amountBigInt > 0n && amountBigInt <= usdcBalanceRaw;
  const canSell = tradeMode === 'sell' && amountBigInt > 0n && amountBigInt <= (side === 'yes' ? yesBalanceRaw : noBalanceRaw);

  const overJumpCap = tradeMode === 'buy' && maxJumpE6 > 0n && amountBigInt > maxJumpE6;

  const totalLpUsdc = BigInt(isObject ? contractData.totalLpUsdc ?? 0n : contractData?.[13] ?? 0n);
  const lpFeesUSDC = BigInt(isObject ? contractData.lpFeesUSDC ?? 0n : contractData?.[14] ?? 0n);
  const lpSharesUser = lpSharesValue;
  const pendingLpFeesValue = pendingFeesValue;
  const pendingLpResidualValue = pendingResidualValue;

  const vaultBase = useMemo(() => parseFloat(formatUnits(vaultE6, 6)), [vaultE6]);
  const yesBase = useMemo(() => parseFloat(formatUnits(qYes, 18)), [qYes]);
  const noBase = useMemo(() => parseFloat(formatUnits(qNo, 18)), [qNo]);
  const maxJumpDisplay = useMemo(() => Number(formatUnits(maxJumpE6, 6)), [maxJumpE6]);
  const splitChunkDisplay = useMemo(
    () => (maxJumpDisplay > 0 ? maxJumpDisplay * 0.98 : 0),
    [maxJumpDisplay],
  );
  const splitPreview = useMemo(() => {
    if (pendingSplitAmount === 0n) return { chunk: 0n, count: 0 };
    let safeChunk = maxJumpE6;
    if (safeChunk > 0n) {
      safeChunk = (safeChunk * SAFETY_MARGIN_BPS) / 10_000n;
      if (safeChunk === 0n) safeChunk = maxJumpE6;
    } else {
      safeChunk = pendingSplitAmount;
    }
    if (safeChunk === 0n) safeChunk = pendingSplitAmount;
    const count = Number((pendingSplitAmount + safeChunk - 1n) / safeChunk);
    return { chunk: safeChunk, count };
  }, [pendingSplitAmount, maxJumpE6]);
  const overCapPreview = useMemo(() => {
    if (!(tradeMode === 'buy' && overJumpCap) || amountBigInt === 0n) return null;
    let safeChunk = maxJumpE6;
    if (safeChunk > 0n) {
      safeChunk = (safeChunk * SAFETY_MARGIN_BPS) / 10_000n;
      if (safeChunk === 0n) safeChunk = maxJumpE6;
    } else {
      safeChunk = amountBigInt;
    }
    if (safeChunk === 0n) safeChunk = amountBigInt;
    const chunkAmount = Number(formatUnits(safeChunk, 6)).toFixed(2);
    const chunkCount = Number((amountBigInt + safeChunk - 1n) / safeChunk);
    return { chunkAmount, chunkCount };
  }, [tradeMode, overJumpCap, amountBigInt, maxJumpE6]);

  // Use centralized market data
  const currentPrices = marketData?.currentPrices || { yes: 0.5, no: 0.5 };
  const instantPrices = marketData?.instantPrices || { yes: 0.5, no: 0.5 };

  // Use current prices from centralized data
  const baseSpotYes = currentPrices.yes;

  const [vaultAfter, setVaultAfter] = useState(vaultBase);
  const [vaultDelta, setVaultDelta] = useState(0);
  const [yesAfter, setYesAfter] = useState(yesBase);
  const [noAfter, setNoAfter] = useState(noBase);

  const showToast = useCallback(
    (title: string, description?: string, type: 'success' | 'error' | 'info' | 'warning' = 'error') => {
      pushToast({ title, description, type });
    },
    [pushToast],
  );

  const showErrorToast = useCallback(
    (error: unknown, fallback: string, type: 'error' | 'warning' = 'error') => {
      const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
      const short = raw.split('\n')[0]?.replace(/^Error:\s*/, '') || fallback;
      showToast(short, raw, type);
    },
    [showToast],
  );

  useEffect(() => {
    setVaultAfter(vaultBase);
    setVaultDelta(0);
    setYesAfter(yesBase);
    setNoAfter(noBase);
  }, [vaultBase, yesBase, noBase]);

  // Helper to get the actual base price for calculations (uses instant price if available)
  const getActualBasePrice = useCallback(() => {
    return instantPrices.yes;
  }, [instantPrices.yes]);

  const resetPreview = useCallback(() => {
    const actualBasePrice = getActualBasePrice();
    const current = side === 'yes' ? clamp(actualBasePrice, 0, 1) : clamp(1 - actualBasePrice, 0, 1);
    setCurrentPrice(current);
    setNewPrice(current);
    setShares(0);
    setAvgPrice(0);
    setCostUsd(0);
    setFeeUsd(0);
    setFeePercent(tradeMode === 'buy' ? totalFeeBps / 100 : 0);
    setMaxProfit(0);
    setMaxProfitPct(0);
    setMaxPayout(0);
    setVaultAfter(vaultBase);
    setVaultDelta(0);
    setYesAfter(yesBase);
    setNoAfter(noBase);
    setGasEstimate(null);
  }, [getActualBasePrice, side, tradeMode, totalFeeBps, vaultBase, yesBase, noBase]);

  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0 || bE18 === 0n) {
      resetPreview();
      return;
    }

    try {
      if (tradeMode === 'buy') {
        const usdcIn = parseUnits(amount, 6);
        if (usdcIn <= 0n) {
          resetPreview();
          return;
        }

        const feeT = usdcIn * BigInt(feeTreasuryBps) / 10_000n;
        const feeV = usdcIn * BigInt(feeVaultBps) / 10_000n;
        const feeL = usdcIn * BigInt(feeLpBps) / 10_000n;
        const net = usdcIn - feeT - feeV - feeL;
        if (net <= 0n) {
          resetPreview();
          return;
        }

        const netE18 = net * USDC_TO_E18;
        const baseSide = side === 'yes' ? qYes : qNo;
        const baseOther = side === 'yes' ? qNo : qYes;
        const tokensOut = findSharesOut(baseSide, baseOther, netE18, bE18);
        if (tokensOut <= 0n) {
          resetPreview();
          return;
        }

        const sharesNum = parseFloat(formatUnits(tokensOut, 18));
        const grossUsd = parseFloat(formatUnits(usdcIn, 6));
        const feeUsdValue = parseFloat(formatUnits(feeT + feeV + feeL, 6));
        const newQYes = side === 'yes' ? qYes + tokensOut : qYes;
        const newQNo = side === 'yes' ? qNo : qNo + tokensOut;
        const newPriceYes = parseFloat(formatUnits(spotPriceYesE18(newQYes, newQNo, bE18), 18));

        const avgPriceGross = sharesNum > 0 ? grossUsd / sharesNum : 0;
        const maxPayoutValue = sharesNum;
        const rawMaxProfit = maxPayoutValue - grossUsd;
        const maxProfitValue = rawMaxProfit > 0 ? rawMaxProfit : 0;
        const profitPct = grossUsd > 0 ? (maxProfitValue / grossUsd) * 100 : 0;

        const vaultIncrease = Number(formatUnits(net + feeV, 6));
        const actualBasePrice = getActualBasePrice();
        setCurrentPrice(side === 'yes' ? clamp(actualBasePrice, 0, 1) : clamp(1 - actualBasePrice, 0, 1));
        setNewPrice(side === 'yes' ? clamp(newPriceYes, 0, 1) : clamp(1 - newPriceYes, 0, 1));
        setShares(sharesNum);
        setAvgPrice(avgPriceGross);
        setCostUsd(grossUsd);
        setFeeUsd(feeUsdValue);
        setFeePercent(totalFeeBps / 100);
        setMaxProfit(maxProfitValue);
        setMaxProfitPct(profitPct);
        setMaxPayout(maxPayoutValue);
        setVaultAfter(vaultBase + vaultIncrease);
        setVaultDelta(vaultIncrease);
        const yesAfterVal = side === 'yes' ? yesBase + sharesNum : yesBase;
        const noAfterVal = side === 'no' ? noBase + sharesNum : noBase;
        setYesAfter(yesAfterVal);
        setNoAfter(noAfterVal);
      } else {
        const tokensIn = parseUnits(amount, 18);
        if (tokensIn <= 0n) {
          resetPreview();
          return;
        }

        if ((side === 'yes' && tokensIn > qYes) || (side === 'no' && tokensIn > qNo)) {
          resetPreview();
          return;
        }

        const oldCost = costFunction(qYes, qNo, bE18);
        const newQYes = side === 'yes' ? qYes - tokensIn : qYes;
        const newQNo = side === 'yes' ? qNo : qNo - tokensIn;
        const newCost = costFunction(newQYes, newQNo, bE18);
        const refundE18 = oldCost - newCost;
        if (refundE18 <= 0n) {
          resetPreview();
          return;
        }

        const usdcOut = refundE18 / USDC_TO_E18;
        const newPriceYes = parseFloat(formatUnits(spotPriceYesE18(newQYes, newQNo, bE18), 18));

        const sharesNum = parseFloat(formatUnits(tokensIn, 18));
        const payout = parseFloat(formatUnits(usdcOut, 6));
        const avgPrice = sharesNum > 0 ? payout / sharesNum : 0;

        const vaultDecrease = Number(formatUnits(usdcOut, 6));
        const actualBasePrice = getActualBasePrice();
        setCurrentPrice(side === 'yes' ? clamp(actualBasePrice, 0, 1) : clamp(1 - actualBasePrice, 0, 1));
        setNewPrice(side === 'yes' ? clamp(newPriceYes, 0, 1) : clamp(1 - newPriceYes, 0, 1));
        setShares(sharesNum);
        setAvgPrice(avgPrice);
        setCostUsd(payout);
        setFeeUsd(0);
        setFeePercent(0);
        setMaxProfit(0);
        setMaxProfitPct(0);
        setMaxPayout(payout);
        setVaultAfter(vaultBase - vaultDecrease);
        setVaultDelta(-vaultDecrease);
        const yesAfterVal = side === 'yes' ? yesBase - sharesNum : yesBase;
        const noAfterVal = side === 'no' ? noBase - sharesNum : noBase;
        setYesAfter(yesAfterVal);
        setNoAfter(noAfterVal);
      }
    } catch (error) {
      console.error('Failed to compute trade preview', error);
      showToast('Preview failed', 'Preview calculation failed. Please try a smaller amount.', 'warning');
      resetPreview();
    }
  }, [amount, tradeMode, side, qYes, qNo, bE18, feeTreasuryBps, feeVaultBps, feeLpBps, totalFeeBps, resetPreview, vaultBase, yesBase, noBase, showToast, getActualBasePrice]);

  // Listen for market state refetch events from webhooks
  useEffect(() => {
    const handleRefetchEvent = () => {
      if (refetchMarketState) {
        refetchMarketState();
      }
    };

    window.addEventListener('refetch-market-state', handleRefetchEvent);
    return () => {
      window.removeEventListener('refetch-market-state', handleRefetchEvent);
    };
  }, [refetchMarketState]);



  const executeSplitBuy = useCallback(async (totalE6: bigint) => {
    if (totalE6 === 0n) return;
    if (!isTradeable) {
      throw new Error('Market is not active for trading.');
    }

    let remaining = totalE6;
    let currentQYes = marketState?.[0];
    let currentQNo = marketState?.[1];
    let chunkFailed = false;
    let failureReason = '';

    if ((currentQYes === undefined || currentQNo === undefined) && refetchMarketState) {
      const refreshed = await refetchMarketState();
      const data = refreshed?.data as (readonly [bigint, bigint, bigint, bigint, bigint]) | undefined;
      currentQYes = data?.[0];
      currentQNo = data?.[1];
    }

    if (currentQYes === undefined || currentQNo === undefined) {
      throw new Error('Market state unavailable');
    }

    while (remaining > 0n) {
      let capValue = maxJumpE6;
      if (refetchMaxJump) {
        const refreshedCap = await refetchMaxJump();
        if (refreshedCap?.data !== undefined) {
          capValue = refreshedCap.data as bigint;
        }
      }

      let safeCap = capValue === 0n ? remaining : capValue;
      if (safeCap > 0n) {
        const margin = (safeCap * SAFETY_MARGIN_BPS) / 10_000n;
        safeCap = margin > 0n ? margin : safeCap;
      }

      let chunk = remaining;
      if (capValue > 0n && chunk > safeCap && safeCap > 0n) {
        chunk = safeCap;
      }
      if (chunk > remaining) chunk = remaining;
      if (chunk <= 0n) break;

      const simulation = simulateBuyChunk(
        chunk,
        currentQYes,
        currentQNo,
        bE18,
        feeTreasuryBps,
        feeVaultBps,
        feeLpBps,
        side === 'yes',
      );

      if (!simulation || simulation.tokensOut === 0n) {
        throw new Error('Cannot simulate chunked buy');
      }

      let minOut = simulation.minOut > 0n ? simulation.minOut : 1n;

      if (!publicClient) throw new Error('RPC client unavailable');
      if (!address) throw new Error('Connect wallet to trade');

      await publicClient.simulateContract({
        address: addresses.core,
        abi: coreAbi,
        functionName: side === 'yes' ? 'buyYes' : 'buyNo',
        args: [marketIdBI, chunk, minOut],
        account: address as `0x${string}`,
      });

      setBusyLabel('Executing split order…');
      const txHash = await writeContractAsync({
        address: addresses.core,
        abi: coreAbi,
        functionName: side === 'yes' ? 'buyYes' : 'buyNo',
        args: [marketIdBI, chunk, minOut],
      });

      try {
        await waitForReceipt(publicClient, txHash as `0x${string}`);
      } catch (e) {
        console.error('Split chunk receipt wait failed', e);
        // 🚨 CHUNK FAILED - Rollback TradingCard state and send rollback event
        setYesAfter(yesBase);
        setNoAfter(noBase);
        setVaultAfter(vaultBase);
        window.dispatchEvent(new CustomEvent('trade-failed', {
          detail: {
            marketId: marketIdBI,
            txHash: txHash,
            reason: 'Split chunk transaction failed'
          }
        }));
        chunkFailed = true;
        failureReason = 'Split chunk transaction failed';
        // Stop processing further chunks on failure
        break;
      }

      // ✅ CHUNK CONFIRMED - Now apply UI updates
      if (simulation.tokensOut > 0n) {
        // Calculate net USDC that goes to vault for this chunk (after fees)
        const feeT = chunk * BigInt(feeTreasuryBps) / 10_000n;
        const feeV = chunk * BigInt(feeVaultBps) / 10_000n;
        const feeL = chunk * BigInt(feeLpBps) / 10_000n;
        const netToVault = chunk - feeT - feeV - feeL;

        // Update TradingCard's local state immediately for this chunk
        setYesAfter(Number(formatUnits(simulation.newQYes, 18)));
        setNoAfter(Number(formatUnits(simulation.newQNo, 18)));
        setVaultAfter(vaultBase + Number(formatUnits(netToVault, 6)));

        // Calculate the new prices for instant UI update
        // Calculate new price using correct LMSR formula (matches contract)
        const chunkPriceE18 = spotPriceYesE18(simulation.newQYes, simulation.newQNo, bE18);
        const chunkNewPriceYes = Number(formatUnits(chunkPriceE18, 18));
        const chunkNewPriceNo = 1 - chunkNewPriceYes;

        // Note: Removed instant-trade-update dispatch - blockchain watchers will handle this
      }

      remaining -= chunk;

      if (refetchMarketState) {
        const refreshedState = await refetchMarketState();
        const data = refreshedState?.data as (readonly [bigint, bigint, bigint, bigint, bigint]) | undefined;
        if (data) {
          currentQYes = data[0];
          currentQNo = data[1];
        } else {
          currentQYes = simulation.newQYes;
          currentQNo = simulation.newQNo;
        }
      } else {
        currentQYes = simulation.newQYes;
        currentQNo = simulation.newQNo;
      }

      await sleep(150);
    }

    await refetchAll();
    if (chunkFailed) {
      throw new Error(failureReason || 'Split order failed');
    }
  }, [
    marketState,
    refetchMarketState,
    maxJumpE6,
    refetchMaxJump,
    bE18,
    feeTreasuryBps,
    feeVaultBps,
    feeLpBps,
    side,
    writeContractAsync,
    publicClient,
    refetchAll,
    marketIdBI,
    isTradeable,
    address,
    baseSpotYes,
    yesBase,
    noBase,
    vaultBase,
  ]);

  const handleTrade = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    if (!isTradeable) {
      showToast('Trading disabled', tradeDisabledReason || 'Market is not active for trading.', 'warning');
      return;
    }

    const amountParsed = amountBigInt;
    setGasEstimate(null);

    try {
      setPendingTrade(true);
      setBusyLabel(tradeMode === 'buy' ? 'Preparing buy…' : 'Preparing sell…');

      if (tradeMode === 'buy') {
        if (address) {
          await ensureAllowance({
            publicClient,
            owner: address as `0x${string}`,
            tokenAddress: addresses.usdc,
            spender: addresses.core,
            required: amountParsed,
            currentAllowance: usdcAllowanceValue,
            writeContractAsync,
            setBusyLabel,
            approvalLabel: 'Approving USDC…',
            abi: usdcAbi,
          });
        }

        if (overJumpCap) {
          setPendingSplitAmount(amountParsed);
          setShowSplitConfirm(true);
          setBusyLabel('');
          return;
        }

        const simulation = simulateBuyChunk(
          amountParsed,
          qYes,
          qNo,
          bE18,
          feeTreasuryBps,
          feeVaultBps,
          feeLpBps,
          side === 'yes',
        );

        if (!simulation) {
          throw new Error('Failed to simulate buy');
        }

        let minOut = simulation.minOut > 0n ? simulation.minOut : 1n;

        if (!publicClient) throw new Error('RPC client unavailable');
        if (!address) throw new Error('Connect wallet to trade');

        const { request } = await publicClient.simulateContract({
          address: addresses.core,
          abi: coreAbi,
          functionName: side === 'yes' ? 'buyYes' : 'buyNo',
          args: [marketIdBI, amountParsed, minOut],
          account: address as `0x${string}`,
        });

        try {
          setGasEstimate(await publicClient.estimateGas({ ...request, to: addresses.core }));
        } catch {}

        if (refetchMaxJump) {
          const refreshedCap = await refetchMaxJump();
          const latestCap = refreshedCap?.data as bigint | undefined;
          if (latestCap && amountParsed > latestCap) {
            setPendingSplitAmount(amountParsed);
            setShowSplitConfirm(true);
            setBusyLabel('');
            return;
          }
        }

        setBusyLabel('Submitting buy…');

        let txHash: `0x${string}`;
        try {
          txHash = await writeContractAsync(request);
        } catch (e) {
          console.error('Buy transaction submission failed', e);
          // 🚨 TRANSACTION REJECTED - Send rollback event
          window.dispatchEvent(new CustomEvent('trade-failed', {
            detail: {
              marketId: marketIdBI,
              txHash: null,
              reason: 'Transaction rejected by user'
            }
          }));
          throw e; // Re-throw to be caught by outer catch block
        }

        try {
          await waitForReceipt(publicClient, txHash);
        } catch (e) {
          console.error('Buy receipt wait failed', e);
          // 🚨 TRANSACTION FAILED - Send rollback event
          window.dispatchEvent(new CustomEvent('trade-failed', {
            detail: {
              marketId: marketIdBI,
              txHash: txHash,
              reason: 'Transaction failed or rejected'
            }
          }));
          throw e; // Re-throw to be caught by outer catch block
        }

        // ✅ TRANSACTION CONFIRMED - Now apply UI updates
        if (simulation) {
          // Calculate net USDC that goes to vault (after fees)
          const feeT = amountParsed * BigInt(feeTreasuryBps) / 10_000n;
          const feeV = amountParsed * BigInt(feeVaultBps) / 10_000n;
          const feeL = amountParsed * BigInt(feeLpBps) / 10_000n;
          const netToVault = amountParsed - feeT - feeV - feeL;

          // Calculate new price using correct LMSR formula (matches contract)
          const tradePriceE18 = spotPriceYesE18(simulation.newQYes, simulation.newQNo, bE18);
          const tradeNewPriceYes = Number(formatUnits(tradePriceE18, 18));
          const tradeNewPriceNo = 1 - tradeNewPriceYes;


          // 🚀 INSTANT UI UPDATE: Update TradingCard's local state after confirmation
          setYesAfter(Number(formatUnits(simulation.newQYes, 18)));
          setNoAfter(Number(formatUnits(simulation.newQNo, 18)));
          setVaultAfter(vaultBase + Number(formatUnits(netToVault, 6)));

        // Note: Removed instant-trade-update dispatch - blockchain watchers will handle this
        }
        setBusyLabel('Finalizing…');
        await refetchAll();
      } else {
        if (address && tokenAddr) {
          await ensureAllowance({
            publicClient,
            owner: address as `0x${string}`,
            tokenAddress: tokenAddr,
            spender: addresses.core,
            required: amountParsed,
            currentAllowance: tokenAllowanceValue,
            writeContractAsync,
            setBusyLabel,
            approvalLabel: 'Approving position token…',
            abi: positionTokenAbi,
          });
        }

        const tokensIn = amountParsed;
        const oldCost = costFunction(qYes, qNo, bE18);
        const newQYes = side === 'yes' ? qYes - tokensIn : qYes;
        const newQNo = side === 'yes' ? qNo : qNo - tokensIn;
        const newCost = costFunction(newQYes, newQNo, bE18);
        const refundE18 = oldCost - newCost;
        const expectedUsdcOut = refundE18 > 0n ? refundE18 / USDC_TO_E18 : 0n;
        const slippageGuard = (expectedUsdcOut * SLIPPAGE_BPS) / 10_000n;
        const minUsdcOut = expectedUsdcOut > slippageGuard ? expectedUsdcOut - slippageGuard : expectedUsdcOut;
        if (minUsdcOut <= MIN_USDC_OUT_E6) {
          throw new Error('Sell output too small after slippage.');
        }

        if (!publicClient) throw new Error('RPC client unavailable');
        if (!address) throw new Error('Connect wallet to trade');

        const { request } = await publicClient.simulateContract({
          address: addresses.core,
          abi: coreAbi,
          functionName: side === 'yes' ? 'sellYes' : 'sellNo',
          args: [marketIdBI, tokensIn, minUsdcOut],
          account: address as `0x${string}`,
        });

        try {
          setGasEstimate(await publicClient.estimateGas({ ...request, to: addresses.core }));
        } catch {}

        setBusyLabel('Submitting sell…');

        let txHash: `0x${string}`;
        try {
          txHash = await writeContractAsync(request);
        } catch (e) {
          console.error('Sell transaction submission failed', e);
          // 🚨 TRANSACTION REJECTED - Send rollback event
          window.dispatchEvent(new CustomEvent('trade-failed', {
            detail: {
              marketId: marketIdBI,
              txHash: null,
              reason: 'Transaction rejected by user'
            }
          }));
          throw e; // Re-throw to be caught by outer catch block
        }

        try {
          await waitForReceipt(publicClient, txHash);
        } catch (e) {
          console.error('Sell receipt wait failed', e);
          // 🚨 TRANSACTION FAILED - Send rollback event
          window.dispatchEvent(new CustomEvent('trade-failed', {
            detail: {
              marketId: marketIdBI,
              txHash: txHash,
              reason: 'Transaction failed or rejected'
            }
          }));
          throw e; // Re-throw to be caught by outer catch block
        }

        // ✅ TRANSACTION CONFIRMED - Now apply UI updates
        const sellTokensIn = amountParsed;
        const sellOldCost = costFunction(qYes, qNo, bE18);
        const sellNewQYes = side === 'yes' ? qYes - sellTokensIn : qYes;
        const sellNewQNo = side === 'yes' ? qNo : qNo - sellTokensIn;
        const sellNewCost = costFunction(sellNewQYes, sellNewQNo, bE18);
        const sellRefundE18 = sellOldCost - sellNewCost;
        const sellExpectedUsdcOut = sellRefundE18 > 0n ? sellRefundE18 / USDC_TO_E18 : 0n;

        // Calculate new price using correct LMSR formula (matches contract)
        const sellPriceE18 = spotPriceYesE18(sellNewQYes, sellNewQNo, bE18);
        const sellNewPriceYes = Number(formatUnits(sellPriceE18, 18));
        const sellNewPriceNo = 1 - sellNewPriceYes;


        if (sellExpectedUsdcOut > 0n) {
          // 🚀 INSTANT UI UPDATE: Update TradingCard's local state after confirmation
          setYesAfter(Number(formatUnits(sellNewQYes, 18)));
          setNoAfter(Number(formatUnits(sellNewQNo, 18)));
          setVaultAfter(vaultBase - Number(formatUnits(sellExpectedUsdcOut, 6)));

          // Note: Removed instant-trade-update dispatch - blockchain watchers will handle this
        }
        setBusyLabel('Finalizing…');
        await refetchAll();
      }
    } catch (error) {
      console.error('Trade failed', error);

      // 🚨 TRADE FAILED - Send rollback event for any optimistic updates
      window.dispatchEvent(new CustomEvent('trade-failed', {
        detail: {
          marketId: marketIdBI,
          reason: 'Trade failed before submission'
        }
      }));

      showErrorToast(error, 'Trade failed. Please try again.', /rejected/i.test(String(error)) ? 'warning' : 'error');
    } finally {
      setPendingTrade(false);
      setBusyLabel('');
    }
  }, [
    amount,
    amountBigInt,
    tradeMode,
    side,
    address,
    overJumpCap,
    writeContractAsync,
    publicClient,
    qYes,
    qNo,
    bE18,
    feeTreasuryBps,
    feeVaultBps,
    feeLpBps,
    usdcAllowanceValue,
    refetchAll,
    tokenAddr,
    tokenAllowanceValue,
    marketIdBI,
    isTradeable,
    refetchMaxJump,
    showErrorToast,
    tradeDisabledReason,
    showToast,
    baseSpotYes,
    vaultBase,
  ]);

  const handleAddLiquidity = useCallback(async () => {
    if (!addLiquidityAmount || parseFloat(addLiquidityAmount) <= 0) return;
    const amountParsed = parseUnits(addLiquidityAmount, 6);
    if (amountParsed <= 0n) return;
    if (!isTradeable) {
      showToast('Trading disabled', tradeDisabledReason || 'Market is not active for trading.', 'warning');
      return;
    }
    try {
      setPendingLpAction('add');

      if (address) {
        await ensureAllowance({
          publicClient,
          owner: address as `0x${string}`,
          tokenAddress: addresses.usdc,
          spender: addresses.core,
          required: amountParsed,
          currentAllowance: usdcAllowanceValue,
          writeContractAsync,
          setBusyLabel,
          approvalLabel: 'Approving USDC…',
          abi: usdcAbi,
        });
      }

      if (!publicClient) throw new Error('RPC client unavailable');
      if (!address) throw new Error('Connect wallet to add liquidity.');

      await publicClient.simulateContract({
        address: addresses.core,
        abi: coreAbi,
        functionName: 'addLiquidity',
        args: [marketIdBI, amountParsed],
        account: address as `0x${string}`,
      });

      const txHash = await writeContractAsync({
        address: addresses.core,
        abi: coreAbi,
        functionName: 'addLiquidity',
        args: [marketIdBI, amountParsed],
      });
      try {
        await waitForReceipt(publicClient, txHash as `0x${string}`);
      } catch (e) {
        console.error('Add liquidity receipt wait failed', e);
      }
      await refetchAll();
      setAddLiquidityAmount('');
    } catch (error) {
      console.error('Add liquidity failed', error);
      showErrorToast(error, 'Add liquidity failed. Please try again.', /rejected/i.test(String(error)) ? 'warning' : 'error');
    } finally {
      setPendingLpAction(null);
    }
  }, [addLiquidityAmount, marketIdBI, writeContractAsync, publicClient, refetchAll, address, usdcAllowanceValue, isTradeable, showErrorToast, showToast, tradeDisabledReason]);

  const handleClaimAllLp = useCallback(async () => {
    if (pendingLpFeesValue === 0n && pendingLpResidualValue === 0n) return;
     try {
       setPendingLpAction('claim');
 
       if (pendingLpFeesValue > 0n) {
         const txHashFees = await writeContractAsync({
           address: addresses.core,
           abi: coreAbi,
           functionName: 'claimLpFees',
           args: [marketIdBI],
         });
         try {
           await waitForReceipt(publicClient, txHashFees as `0x${string}`);
         } catch (e) {
           console.error('Claim LP fees receipt wait failed', e);
         }
       }
 
       if (pendingLpResidualValue > 0n) {
         const txHashResidual = await writeContractAsync({
           address: addresses.core,
           abi: coreAbi,
           functionName: 'claimLpResidual',
           args: [marketIdBI],
         });
         try {
           await waitForReceipt(publicClient, txHashResidual as `0x${string}`);
         } catch (e) {
           console.error('Claim LP residual receipt wait failed', e);
         }
       }
 
       await refetchAll();
       showToast('Rewards claimed', 'LP rewards were claimed successfully.', 'success');
     } catch (error) {
       console.error('Claim LP failed', error);
       showErrorToast(error, 'Claim failed. Please try again.', /rejected/i.test(String(error)) ? 'warning' : 'error');
     } finally {
       setPendingLpAction(null);
     }
  }, [marketIdBI, pendingLpFeesValue, pendingLpResidualValue, writeContractAsync, publicClient, refetchAll, showToast, showErrorToast]);

  const handleRedeem = useCallback(async (isYes: boolean) => {
    if (!isResolved || !resolution?.isResolved) {
      showToast('Redeem unavailable', 'Market is not resolved yet.', 'warning');
      return;
    }
    const balance = isYes ? yesBalanceRaw : noBalanceRaw;
    if (balance === 0n) {
      showToast('Nothing to redeem', 'You have no winning tokens to redeem.', 'info');
      return;
    }
    if (isYes !== resolution.yesWins) {
      showToast('Not eligible', 'Only the winning side can redeem.', 'warning');
      return;
    }
    try {
      setBusyLabel('Redeeming...');
      const txHash = await writeContractAsync({
        address: addresses.core,
        abi: coreAbi,
        functionName: 'redeem',
        args: [marketIdBI, isYes],
      });
      try {
        await waitForReceipt(publicClient, txHash as `0x${string}`);
      } catch (e) {
        console.error('Redeem receipt wait failed', e);
      }
      await refetchAll();
      showToast('Redeemed', 'Rewards successfully redeemed.', 'success');
    } catch (error) {
      console.error('Redeem failed', error);
      showErrorToast(error, 'Redeem failed. Please try again.', /rejected/i.test(String(error)) ? 'warning' : 'error');
    } finally {
      setBusyLabel('');
    }
  }, [isResolved, resolution, yesBalanceRaw, noBalanceRaw, writeContractAsync, publicClient, refetchAll, marketIdBI, showToast, showErrorToast]);

  const handleConfirmSplit = useCallback(async () => {
    if (pendingSplitAmount === 0n) {
      setShowSplitConfirm(false);
      return;
    }
    if (!isTradeable) {
      showToast('Trading disabled', tradeDisabledReason || 'Market is not active for trading.', 'warning');
      return;
    }
    try {
      setShowSplitConfirm(false);
      setPendingTrade(true);
      setBusyLabel('Executing split order…');
      await executeSplitBuy(pendingSplitAmount);
      setBusyLabel('Finalizing…');
      await refetchAll();
    } catch (error) {
      console.error('Split execution failed', error);
      showErrorToast(error, 'Split order failed. Please try again.', /rejected/i.test(String(error)) ? 'warning' : 'error');
    } finally {
      setPendingTrade(false);
      setBusyLabel('');
      setPendingSplitAmount(0n);
    }
  }, [pendingSplitAmount, executeSplitBuy, refetchAll, isTradeable, showErrorToast, showToast, tradeDisabledReason]);

  const handleCancelSplit = useCallback(() => {
    setShowSplitConfirm(false);
    setPendingSplitAmount(0n);
  }, []);

  // Use centralized market data
  const priceYes = instantPrices.yes;
  const priceNo = instantPrices.no;

  const formatPrice = (p: number) => p >= 1 ? `$${p.toFixed(2)}` : `${(p * 100).toFixed(1)}¢`;

  const maxBuyAmount = parseFloat(formatUnits(usdcBalanceRaw, 6));
  const maxSellAmount = side === 'yes'
    ? parseFloat(formatUnits(yesBalanceRaw, 18))
    : parseFloat(formatUnits(noBalanceRaw, 18));

  const lpShareFloat = useMemo(() => parseFloat(formatUnits(lpSharesUser, 6)), [lpSharesUser]);
  const totalLpFloat = useMemo(() => parseFloat(formatUnits(totalLpUsdc, 6)), [totalLpUsdc]);
  const pendingFeesFloat = useMemo(() => parseFloat(formatUnits(pendingLpFeesValue, 6)), [pendingLpFeesValue]);
  const pendingResidualFloat = useMemo(() => parseFloat(formatUnits(pendingLpResidualValue, 6)), [pendingLpResidualValue]);
  const lpFeePoolFloat = useMemo(() => parseFloat(formatUnits(lpFeesUSDC, 6)), [lpFeesUSDC]);
  const userSharePct = totalLpFloat > 0 ? (lpShareFloat / totalLpFloat) * 100 : 0;
  const addAmountFloat = parseFloat(addLiquidityAmount) || 0;
  const canAddLiquidity = addAmountFloat > 0 && addAmountFloat <= maxBuyAmount;
  const isLpProcessing = pendingLpAction !== null;

  const tradeMultiple =
    tradeMode === 'buy' && costUsd > 0 && Number.isFinite(maxPayout / costUsd)
      ? maxPayout / costUsd
      : 0;

  const totalSplitDisplay = pendingSplitAmount > 0n ? Number(formatUnits(pendingSplitAmount, 6)).toFixed(2) : amount;
  const splitChunkAmountDisplay = splitPreview.chunk > 0n
    ? Number(formatUnits(splitPreview.chunk, 6)).toFixed(2)
    : splitChunkDisplay > 0 ? splitChunkDisplay.toFixed(2) : '0.00';
  const splitChunkCountDisplay = splitPreview.count;

  const safeMaxBuy = useMemo(() => {
    const safe = Number(formatUnits(maxJumpE6 * SAFETY_MARGIN_BPS / 10_000n, 6));
    return Math.min(maxBuyAmount, safe > 0 ? safe : maxBuyAmount);
  }, [maxJumpE6, maxBuyAmount]);

  const comparisonLabels = ['Above', 'Below', 'Equals'];
  const oracleTypeLabels = ['None', 'ChainlinkFeed'];

  return (
    <>
      {showSplitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={handleCancelSplit} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Split Order Confirmation</h3>
              <p className="text-sm text-gray-600 mt-1">
                This buy would exceed the single-transaction price jump limit. We will execute it in smaller chunks.
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Total buy</span>
                <span className="font-semibold">{totalSplitDisplay} USDC</span>
              </div>
              <div className="flex justify-between">
                <span>Chunk size</span>
                <span className="font-semibold">{splitChunkAmountDisplay} USDC</span>
              </div>
              {splitChunkCountDisplay > 0 && (
                <div className="flex justify-between">
                  <span>Estimated chunks</span>
                  <span className="font-semibold">{splitChunkCountDisplay}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCancelSplit}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSplit}
                disabled={!isTradeable || isBusy}
                className="flex-1 py-2 rounded-lg bg-green-500 text-white font-bold hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Split & Execute
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6" data-testid="trading-card">
        {!isTradeable && (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-sm font-semibold px-4 py-3"
            aria-live="polite"
          >
            {tradeDisabledReason}
          </div>
        )}
        <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
          {(['buy', 'sell'] as const).map(m => (
            <button
              key={m}
              onClick={() => {
                if (!isBusy && isTradeable) setTradeMode(m);
              }}
              className={`flex-1 rounded-lg py-2.5 font-bold transition-all ${tradeMode === m ? 'bg-green-500 text-white' : 'text-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
              disabled={!isTradeable}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(['yes', 'no'] as const).map(s => (
            <button
              key={s}
              onClick={() => {
                if (!isBusy && isTradeable) setSide(s);
              }}
              className={`p-4 rounded-xl text-left transition-all ${side === s ? 'ring-2 ring-green-500' : ''} ${s === 'yes' ? 'bg-green-50' : 'bg-red-50'} disabled:opacity-50 disabled:cursor-not-allowed`}
              disabled={!isTradeable}
            >
              <div className="text-2xl font-black">{formatPrice(s === 'yes' ? priceYes : priceNo)}</div>
              <div className="text-xs font-bold uppercase text-gray-600">{s}</div>
              <div className="text-xs text-gray-500 mt-1">
                You have: {s === 'yes' ? yesBalance : noBalance}
              </div>
            </button>
          ))}
        </div>

        <div className="text-center text-sm text-gray-600">
          {tradeMode === 'buy' ? `USDC Balance: ${usdcBalance}` : `${side.toUpperCase()} Balance: ${side === 'yes' ? yesBalance : noBalance}`}
        </div>

        <input
          type="text"
          inputMode="decimal"
          pattern={amountRegex.source}
          value={amount}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const val = e.target.value;
            if (!val) {
              setAmount('');
              return;
            }
            if (!amountRegex.test(val)) return;
            if (val === '.' || val.endsWith('.')) {
              setAmount(val);
              return;
            }
            const num = parseFloat(val);
            if (!Number.isFinite(num)) return;
            if (tradeMode === 'buy' && num > maxBuyAmount) return;
            if (tradeMode === 'sell' && num > maxSellAmount) return;
            setAmount(formatAmount(num));
          }}
          placeholder="0.0"
          className="w-full rounded-lg border px-4 py-3 text-lg font-semibold text-center focus:ring-2 focus:ring-green-500"
          disabled={isBusy || showSplitConfirm || !isTradeable}
        />

        <div className="flex gap-2">
          {['10', '50', '100', 'Max'].map(q => (
            <button
              key={q}
              onClick={() => {
                if (q === 'Max') {
                  const maxValue = tradeMode === 'buy'
                    ? safeMaxBuy
                    : side === 'yes'
                      ? Number(formatUnits(yesBalanceRaw, 18))
                      : Number(formatUnits(noBalanceRaw, 18));
                  const maxString = Number.isFinite(maxValue) ? formatAmount(maxValue) : '0';
                  setAmount(maxString);
                } else {
                  const preset = Number(q);
                  setAmount(formatAmount(preset));
                }
              }}
              disabled={isBusy || showSplitConfirm || !isTradeable}
              className="flex-1 bg-green-50 hover:bg-green-100 py-2 rounded-lg font-bold text-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {q}
            </button>
          ))}
        </div>

        {tradeMode === 'buy' && maxJumpE6 > 0n && isTradeable && (
          <div className="text-xs text-gray-500 text-center">
            Max single-tx buy (safe, 98%): {splitChunkAmountDisplay} USDC
          </div>
        )}

        {tradeMode === 'buy' && overJumpCap && isTradeable && (
          <div className="rounded-md bg-amber-50 text-amber-800 p-2 text-sm">
            Large order will be split automatically to keep prices stable.
            {overCapPreview && (
              <>
                {' '}≈{overCapPreview.chunkCount} chunks of {overCapPreview.chunkAmount} USDC.
              </>
            )}
          </div>
        )}

        {amount && parseFloat(amount) > 0 && (
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
                <span>{gasEstimate.toString()} wei (~{Number(formatUnits(gasEstimate, 9)).toFixed(3)} gwei)</span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={(e) => {
            e.preventDefault();
            if (isBusy || showSplitConfirm || !isTradeable) return;
            void handleTrade();
          }}
          disabled={
            isBusy ||
            !amount || parseFloat(amount) <= 0 ||
            (tradeMode === 'buy' && !canBuy) ||
            (tradeMode === 'sell' && !canSell) ||
            showSplitConfirm ||
            !isTradeable
          }
          className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busyLabel ? busyLabel : tradeMode.toUpperCase()}
        </button>

        {isResolved && (
          <div className="pt-6 border-t border-gray-200 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Redeem Winnings</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleRedeem(true)}
                disabled={yesBalanceRaw === 0n || !resolution?.yesWins || isBusy}
                className="p-4 rounded-xl bg-green-50 text-left disabled:opacity-50"
              >
                <div className="text-xl font-bold">Yes</div>
                <div className="text-xs">Balance: {yesBalance}</div>
              </button>
              <button
                onClick={() => handleRedeem(false)}
                disabled={noBalanceRaw === 0n || resolution?.yesWins || isBusy}
                className="p-4 rounded-xl bg-red-50 text-left disabled:opacity-50"
              >
                <div className="text-xl font-bold">No</div>
                <div className="text-xs">Balance: {noBalance}</div>
              </button>
            </div>
          </div>
        )}

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
      </div>
    </>
  );
}