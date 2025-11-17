'use client';
// @ts-nocheck

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import Header from '@/components/Header';
import { useAccount, useWriteContract, usePublicClient, useBlockNumber } from 'wagmi';
import { getMarketCount, getMarket, getSpotPriceYesE6, getMarketResolution } from '@/lib/hooks';
import { addresses } from '@/lib/contracts';
import { coreAbi, positionTokenAbi } from '@/lib/abis';
import { formatUnits, decodeEventLog } from 'viem';
import { fetchSubgraph } from '@/lib/subgraphClient';

interface ClaimableReward {
  marketId: number;
  question: string;
  resolvedDate: string;
  amount: number;
  side: 'YES' | 'NO';
  winning: boolean;
  yesBalance: string;
  noBalance: string;
  yesPrice: number;
  noPrice: number;
  claimedAt?: string;
}

interface ClaimRecord {
  marketId: number;
  user: string;
  amount: number;
  claimedAt: string;
}

const CLAIMED_STORAGE_KEY = 'claimedRewards';
const getScopedStorageKey = () => `${CLAIMED_STORAGE_KEY}:${addresses.core.toLowerCase()}`;

const parseDate = (value?: string) => {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
};

export default function ClaimPage() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<'available' | 'history'>('available');
  const [availableToClaim, setAvailableToClaim] = useState(0);
  const [totalClaimed, setTotalClaimed] = useState(0);
  const [claimableRewards, setClaimableRewards] = useState<ClaimableReward[]>([]);
  const [claimHistory, setClaimHistory] = useState<ClaimableReward[]>([]);
  const [claimedIds, setClaimedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<number | null>(null);
const processedRedemptionsRef = useRef<Set<string>>(new Set());
  const claimableRewardsRef = useRef<ClaimableReward[]>([]);
  const claimableRewardsStateRef = useRef<ClaimableReward[]>([]);
  const addressRef = useRef<string | undefined>(address);

  const { writeContractAsync, isPending } = useWriteContract();

  const publicClient = usePublicClient();
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const loadClaimableRewards = useCallback(async () => {
    if (!address || !isConnected || !publicClient) {
      setLoading(false);
      return;
    }

    try {
      let storedHistory: ClaimableReward[] = [];
      const scopedKey = getScopedStorageKey();

      if (typeof window !== 'undefined') {
        // Backward compatibility: remove unscoped cache when switching contracts
        try {
          window.localStorage.removeItem(CLAIMED_STORAGE_KEY);
        } catch (error) {
          console.warn('Failed to clear legacy claimed rewards cache', error);
        }

        try {
          const stored = window.localStorage.getItem(scopedKey);
          if (stored) {
            storedHistory = JSON.parse(stored);
            setClaimHistory(storedHistory);
            setClaimedIds(new Set(storedHistory.map((r) => r.marketId)));
          } else {
            setClaimHistory([]);
            setClaimedIds(new Set());
          }
        } catch (error) {
          console.error('Failed to load claimed rewards from storage', error);
          setClaimHistory([]);
          setClaimedIds(new Set());
        }
      } else {
        setClaimHistory([]);
        setClaimedIds(new Set());
      }

      const claimedMap = new Map<number, ClaimableReward>();
      storedHistory.forEach((entry) => claimedMap.set(entry.marketId, entry));

      const claimedByMarket = new Map<number, { amount: number; claimedAt: string }>();
      storedHistory.forEach(entry => {
        const claimedAt = entry.claimedAt ?? entry.resolvedDate;
        claimedByMarket.set(entry.marketId, {
          amount: entry.amount,
          claimedAt,
        });
      });

      try {
        const data = await fetchSubgraph<{
          redemptions: Array<{
            amount: string;
            timestamp: string;
            market: { id: string };
          }>;
        }>(
          `
            query UserRedemptions($user: String!) {
              redemptions(
                where: { user: $user }
                orderBy: timestamp
                orderDirection: desc
                first: 200
              ) {
                amount
                timestamp
                market {
                  id
                }
              }
            }
          `,
          { user: address.toLowerCase() },
        );

        for (const redemption of data.redemptions ?? []) {
          const marketId = Number(redemption.market?.id ?? '0');
          if (!Number.isFinite(marketId) || marketId <= 0) continue;
          const amountNumber = Number(formatUnits(BigInt(redemption.amount), 6));
          const claimedAtIso = new Date(Number(redemption.timestamp) * 1000).toISOString();
          claimedByMarket.set(marketId, {
            amount: amountNumber,
            claimedAt: claimedAtIso,
          });
        }
      } catch (error) {
        console.warn('[ClaimPage] Failed to load claims from subgraph', error);
      }

      const count = await getMarketCount();
      const totalMarkets = Number(count);
      const marketIds = Array.from({ length: totalMarkets }, (_, index) => index + 1);

      type ProcessedMarket = {
        marketId: number;
        claimable: ClaimableReward | null;
        claimed: ClaimableReward | null;
      };

      const processedMarkets = await Promise.all(
        marketIds.map(async (marketId): Promise<ProcessedMarket> => {
          try {
            const marketIdBigInt = BigInt(marketId);
            const [market, resolution] = await Promise.all([
              getMarket(marketIdBigInt),
              getMarketResolution(marketIdBigInt),
            ]);

            if (!market?.exists || !resolution?.isResolved) {
              return { marketId, claimable: null, claimed: null };
        }
        
            const yesAddress = market.yes as `0x${string}` | undefined;
            const noAddress = market.no as `0x${string}` | undefined;

            const [yesPriceRaw, yesBalanceRaw, noBalanceRaw] = await Promise.all([
              getSpotPriceYesE6(marketIdBigInt),
              yesAddress
                ? publicClient
                    .readContract({
                      address: yesAddress,
          abi: positionTokenAbi,
          functionName: 'balanceOf',
          args: [address],
                    })
                    .catch(() => 0n)
                : Promise.resolve(0n),
              noAddress
                ? publicClient
                    .readContract({
                      address: noAddress,
          abi: positionTokenAbi,
          functionName: 'balanceOf',
          args: [address],
                    })
                    .catch(() => 0n)
                : Promise.resolve(0n),
            ]);

            const yesPrice = Number(yesPriceRaw) / 1e6;
            const noPrice = 1 - yesPrice;
            const yesBalance = typeof yesBalanceRaw === 'bigint' ? formatUnits(yesBalanceRaw, 18) : '0';
            const noBalance = typeof noBalanceRaw === 'bigint' ? formatUnits(noBalanceRaw, 18) : '0';

            const yesWon = Boolean(resolution.yesWins);
            const noWon = !yesWon;
        
        let claimableAmount = 0;
        let side: 'YES' | 'NO' = 'YES';
        let winning = false;

        if (yesWon && parseFloat(yesBalance) > 0) {
              claimableAmount = parseFloat(yesBalance);
          side = 'YES';
          winning = true;
        } else if (noWon && parseFloat(noBalance) > 0) {
              claimableAmount = parseFloat(noBalance);
          side = 'NO';
          winning = true;
        }

          const resolvedDate = resolution.expiryTimestamp > 0n
            ? new Date(Number(resolution.expiryTimestamp) * 1000).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                  day: 'numeric',
              })
            : new Date().toISOString().split('T')[0];
          
            const claimable =
              claimableAmount > 0
                ? {
                    marketId,
            question: market.question as string,
            resolvedDate,
            amount: claimableAmount,
            side,
            winning,
            yesBalance,
            noBalance,
            yesPrice,
            noPrice,
                    claimedAt: undefined,
        }
                : null;

            const claimedInfo = claimedByMarket.get(marketId) ?? null;
            const claimed = claimedInfo
              ? {
                  marketId,
            question: market.question as string,
            resolvedDate,
            amount: claimedInfo.amount,
                  side: (yesWon ? 'YES' : 'NO') as 'YES' | 'NO',
            winning: true,
            yesBalance: '0',
            noBalance: '0',
                  yesPrice,
            noPrice: 1 - yesPrice,
            claimedAt: claimedInfo.claimedAt,
                }
              : null;

            return { marketId, claimable, claimed };
          } catch (error) {
            console.error('[ClaimPage] Failed to process market', { marketId, error });
            return { marketId, claimable: null, claimed: null };
          }
        }),
      );

      const rewards: ClaimableReward[] = [];
      let totalAvailable = 0;

      processedMarkets.forEach(({ claimable, claimed, marketId }) => {
        if (claimable) {
          rewards.push(claimable);
          totalAvailable += claimable.amount;
        }
        if (claimed) {
          claimedMap.set(marketId, claimed);
        } 
      });

      setClaimableRewards(rewards);
      claimableRewardsRef.current = rewards; // Keep ref in sync
      setAvailableToClaim(totalAvailable);
      const historyList = Array.from(claimedMap.values()).sort(
        (a, b) => parseDate(b.claimedAt ?? b.resolvedDate) - parseDate(a.claimedAt ?? a.resolvedDate),
      );
      setClaimHistory(historyList);
      setClaimedIds(new Set(historyList.map((entry) => entry.marketId)));
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(scopedKey, JSON.stringify(historyList));
        } catch (error) {
          console.error('Failed to persist claimed rewards', error);
        }
      }
    } catch (error) {
      console.error('Error loading claimable rewards:', error);
    } finally {
      setLoading(false);
    }
  }, [address, isConnected, publicClient]);

  // Keep refs in sync with state
  useEffect(() => {
    addressRef.current = address;
  }, [address]);
  
  useEffect(() => {
    claimableRewardsRef.current = claimableRewards;
    claimableRewardsStateRef.current = claimableRewards;
  }, [claimableRewards]);

  useEffect(() => {
    const total = claimHistory.reduce((acc, reward) => acc + reward.amount, 0);
    console.log('[ClaimPage] Recalculating total claimed:', {
      claimHistoryLength: claimHistory.length,
      amounts: claimHistory.map(r => r.amount),
      newTotal: total
    });
    setTotalClaimed(total);
  }, [claimHistory]);

  // Listen for instant claim updates (similar to trading card's instant trade updates)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleInstantClaimUpdate = (event: any) => {
      const detail = event.detail;
      const { marketId, user, amount, claimedAt, txHash, source } = detail;

      // Use ref to get latest address (avoid stale closure)
      const currentAddress = addressRef.current;

      // Only process if this is for the current user
      if (user?.toLowerCase() !== currentAddress?.toLowerCase()) {
        console.log('[ClaimPage] Ignoring claim update for different user:', user, 'vs', currentAddress);
        return;
      }

      const marketIdNum = Number(marketId);
      console.log('[ClaimPage] Instant claim update received:', { marketId: marketIdNum, amount, txHash, source });

      // Use ref to get latest claimable rewards (avoid stale closure)
      const currentClaimableRewards = claimableRewardsStateRef.current;
      
      // Update claimable rewards immediately - remove the claimed market
      // Also capture the reward details before filtering for history entry
      const capturedReward = currentClaimableRewards.find((reward: ClaimableReward) => reward.marketId === marketIdNum);
      
      setClaimableRewards(prev => {
        console.log('[ClaimPage] Current claimable rewards before update:', prev.map(r => ({ id: r.marketId, amount: r.amount })));
        
        const filtered = prev.filter(reward => reward.marketId !== marketIdNum);
        console.log('[ClaimPage] Filtered claimable rewards:', prev.length, '->', filtered.length, 'removed market:', marketIdNum);
        
        // Update ref immediately so it's available for other updates
        claimableRewardsRef.current = filtered;
        claimableRewardsStateRef.current = filtered; // Also update state ref
        
        // Update available to claim amount based on filtered rewards
        const newAvailableToClaim = filtered.reduce((acc, reward) => acc + reward.amount, 0);
        console.log('[ClaimPage] ✅ Updated available to claim:', newAvailableToClaim, 'calculated from', filtered.length, 'remaining rewards');
        setAvailableToClaim(newAvailableToClaim);
        
        return filtered;
      });

      // Update claimed IDs immediately
      setClaimedIds(prev => {
        const next = new Set(prev);
        next.add(marketIdNum);
        console.log('[ClaimPage] Added to claimed IDs:', marketIdNum, 'total claimed:', next.size);
        return next;
      });

      // Add to claim history - update immediately for both sources
      if (claimedAt) {
        const historyEntry: ClaimableReward = {
          marketId: marketIdNum,
          question: capturedReward?.question ?? '',
          resolvedDate: capturedReward?.resolvedDate ?? new Date().toISOString().split('T')[0],
          amount,
          side: capturedReward?.side ?? 'YES',
          winning: true,
          yesBalance: '0',
          noBalance: '0',
          yesPrice: capturedReward?.yesPrice ?? 0,
          noPrice: capturedReward?.noPrice ?? 0,
          claimedAt,
        };
        
        setClaimHistory(prev => {
          // Remove existing entry if present (in case of duplicate)
          const filtered = prev.filter(entry => entry.marketId !== marketIdNum);
          const newHistory = [historyEntry, ...filtered].sort(
            (a, b) => parseDate(b.claimedAt ?? b.resolvedDate) - parseDate(a.claimedAt ?? a.resolvedDate),
          );
          console.log('[ClaimPage] Updated claim history:', {
            source,
            added: historyEntry,
            totalItems: newHistory.length,
            totalAmount: newHistory.reduce((acc, r) => acc + r.amount, 0)
          });
          
          // Update localStorage immediately
          if (typeof window !== 'undefined') {
            try {
              window.localStorage.setItem(getScopedStorageKey(), JSON.stringify(newHistory));
            } catch (error) {
              console.error('[ClaimPage] Failed to persist claimed rewards', error);
            }
          }
          
          return newHistory;
        });
      }
    };

    window.addEventListener('instant-claim-update', handleInstantClaimUpdate);
    return () => {
      window.removeEventListener('instant-claim-update', handleInstantClaimUpdate);
    };
  }, []); // Empty deps - use refs instead to avoid stale closures

  const handleWebhookRedemption = useCallback(
    (rawEvent: unknown): 'handled' | 'ignored' | 'refresh' => {
      if (!address) {
        return 'ignored';
      }

      if (!rawEvent || typeof rawEvent !== 'object') {
        return 'ignored';
      }

      const event = (rawEvent as { payload?: unknown })?.payload ?? rawEvent;
      if (!event || typeof event !== 'object') {
        return 'ignored';
      }

      const entityRaw =
        (event as any).entity ?? (event as any).type ?? (event as any).model ?? (event as any).table ?? null;
      const entity =
        typeof entityRaw === 'string'
          ? entityRaw.toLowerCase()
          : Array.isArray(entityRaw)
            ? entityRaw.join('').toLowerCase()
            : null;

      const redemptionEntityAliases = new Set(['redemption', 'redemptions', 'claim', 'claims']);

      if (!entity || !redemptionEntityAliases.has(entity)) {
        return 'ignored';
      }

      const dataCandidate =
        (event as any).data ??
        (event as any).new ??
        (event as any).record ??
        ((event as any).oldNew?.new ?? null) ??
        ((event as any).event === 'INSERT' ? (event as any).row : null) ??
        (event as any).redemption ??
        null;

      if (!dataCandidate || typeof dataCandidate !== 'object') {
        return 'ignored';
      }

      const data =
        typeof (dataCandidate as any).new === 'object' && (dataCandidate as any).new !== null
          ? (dataCandidate as any).new
          : dataCandidate;

      const normalize = (value: any): string | null => {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'bigint') return value.toString();
        if (typeof value === 'object') {
          if ('id' in value && typeof (value as { id?: unknown }).id === 'string') {
            return (value as { id: string }).id;
          }
          return null;
        }
        return null;
      };

      const userRaw =
        normalize((data as any).user) ??
        normalize((data as any).account) ??
        normalize((data as any).trader) ??
        normalize((data as any).userId);
      const userLower = userRaw?.toLowerCase() ?? null;
      if (!userLower || userLower !== address.toLowerCase()) {
        return 'ignored';
      }

      const marketIdRaw =
        normalize((data as any).market?.id) ?? normalize((data as any).market) ?? normalize((data as any).market_id);
      const marketId = Number(marketIdRaw);
      if (!Number.isFinite(marketId) || marketId <= 0) {
        return 'ignored';
      }

      const uniqueKey =
        normalize((event as any).id) ??
        normalize((data as any).id) ??
        `${marketId}-${normalize((data as any).timestamp) ?? Date.now().toString()}`;
      if (!uniqueKey) {
        void loadClaimableRewards();
        return 'refresh';
      }

      if (processedRedemptionsRef.current.has(uniqueKey)) {
        return 'ignored';
      }
      processedRedemptionsRef.current.add(uniqueKey);
      if (processedRedemptionsRef.current.size > 500) {
        const iterator = processedRedemptionsRef.current.values();
        const first = iterator.next();
        if (!first.done) {
          processedRedemptionsRef.current.delete(first.value);
        }
      }

      const amountRaw =
        normalize((data as any).amount) ??
        normalize((data as any).usdcOut) ??
        normalize((data as any).usdc_out) ??
        normalize((data as any).value);

      let amountNumber = 0;
      if (amountRaw) {
        try {
          amountNumber = Number(formatUnits(BigInt(amountRaw), 6));
        } catch (error) {
          const parsed = Number(amountRaw);
          if (Number.isFinite(parsed)) {
            amountNumber = parsed;
          }
        }
      }

      const timestampRaw =
        normalize((data as any).timestamp) ??
        normalize((data as any).blockTimestamp) ??
        normalize((data as any).block_timestamp) ??
        normalize((data as any).created_at);
      const claimedAtIso = timestampRaw
        ? new Date(Number(timestampRaw) * 1000).toISOString()
        : new Date().toISOString();

      const existingClaimable = claimableRewards.find(entry => entry.marketId === marketId);
      const existingHistory = claimHistory.find(entry => entry.marketId === marketId);

      const base = existingClaimable ?? existingHistory ?? null;
      const effectiveAmount = amountNumber > 0 ? amountNumber : base?.amount ?? 0;

      const nextEntry: ClaimableReward = {
        marketId,
        question: base?.question ?? '',
        resolvedDate: base?.resolvedDate ?? claimedAtIso,
        amount: effectiveAmount,
        side: base?.side ?? 'YES',
        winning: base?.winning ?? true,
        yesBalance: '0',
        noBalance: '0',
        yesPrice: base?.yesPrice ?? 0,
        noPrice: base?.noPrice ?? 0,
        claimedAt: claimedAtIso,
      };

      setClaimHistory(prev => {
        const existing = new Map(prev.map(entry => [entry.marketId, entry]));
        existing.set(marketId, nextEntry);
        const next = Array.from(existing.values()).sort(
          (a, b) => parseDate(b.claimedAt ?? b.resolvedDate) - parseDate(a.claimedAt ?? a.resolvedDate),
        );
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(getScopedStorageKey(), JSON.stringify(next));
          } catch (error) {
            console.error('[ClaimPage] Failed to persist claimed rewards after webhook', error);
          }
        }
        return next;
      });

      setClaimedIds(prev => {
        const next = new Set(prev);
        next.add(marketId);
        return next;
      });

      if (existingClaimable) {
        setClaimableRewards(prev => prev.filter(entry => entry.marketId !== marketId));
        setAvailableToClaim(prev => {
          const next = prev - existingClaimable.amount;
          return next > 0 ? next : 0;
        });
      } else {
        // no cached claimable info – race a full refresh for safety
        void loadClaimableRewards();
      }

      return 'handled';
    },
    [address, claimableRewards, claimHistory, loadClaimableRewards],
  );

  useEffect(() => {
    loadClaimableRewards();
  }, [loadClaimableRewards]);

  // Watch for new blocks - but don't refresh on every block (too slow)
  // The blockchain event watcher handles instant updates immediately
  // This is just a periodic background refresh to catch any missed events
  const lastBackgroundRefreshRef = useRef<number>(0);
  useEffect(() => {
    if (!blockNumber || !address || !isConnected) return;
    
    // Only do background refresh every 30 seconds (not every block)
    // The blockchain event watcher handles instant updates
    const now = Date.now();
    const timeSinceLastRefresh = now - lastBackgroundRefreshRef.current;
    const REFRESH_INTERVAL_MS = 30000; // 30 seconds
    
    if (timeSinceLastRefresh < REFRESH_INTERVAL_MS) {
      return;
    }
    
    lastBackgroundRefreshRef.current = now;
    console.log('[ClaimPage] Background refresh of claimable rewards (30s interval):', blockNumber);
    void loadClaimableRewards();
  }, [blockNumber, address, isConnected, loadClaimableRewards]);

  // Watch blockchain events for redemptions and update claim balances immediately
  // Similar to how market detail page watches for trades
  useEffect(() => {
    if (!publicClient || !address) {
      return;
    }

    const processedTxHashes = new Set<string>();

    // Watch for Redeemed events - update immediately like market page does
    const unwatchRedeemed = publicClient.watchContractEvent({
      address: addresses.core,
      abi: coreAbi,
      eventName: 'Redeemed',
      onLogs: async (logs) => {
        for (const log of logs) {
          try {
            // Skip if no transaction hash
            if (!log.transactionHash) continue;
            
            // Skip if we've already processed this transaction
            if (processedTxHashes.has(log.transactionHash)) {
              continue;
            }

            const decoded = decodeEventLog({
              abi: coreAbi,
              data: log.data,
              topics: log.topics,
            }) as { eventName: string; args: Record<string, unknown> };

            if (decoded.eventName !== 'Redeemed') continue;

            const args = decoded.args as Record<string, unknown>;
            const userArg = (args?.user as string | undefined)?.toLowerCase();

            // Only process if it's for the current user
            if (!userArg || userArg !== address.toLowerCase()) continue;

            const idRaw = args?.id;
            if (idRaw === undefined || idRaw === null) continue;

            const marketId = Number(idRaw);
            if (!Number.isFinite(marketId)) continue;

            const usdcOutRaw = args?.usdcOut as bigint | undefined;
            if (usdcOutRaw === undefined) continue;

            const amount = Number(formatUnits(usdcOutRaw, 6));
            if (!Number.isFinite(amount) || amount <= 0) continue;

            // Mark as processed
            processedTxHashes.add(log.transactionHash);
            if (processedTxHashes.size > 1000) {
              // Keep set size manageable
              const first = processedTxHashes.values().next().value;
              if (first) {
                processedTxHashes.delete(first);
              }
            }

            // Get block timestamp for accurate claimedAt
            let claimedAtIso = new Date().toISOString();
            if (log.blockNumber) {
              try {
                const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
                if (block?.timestamp) {
                  claimedAtIso = new Date(Number(block.timestamp) * 1000).toISOString();
                }
              } catch (error) {
                console.warn('[ClaimPage] Failed to get block timestamp, using current time', error);
              }
            }

            console.log('[ClaimPage] 🔔 Blockchain Redeemed event detected:', {
              marketId,
              amount,
              txHash: log.transactionHash,
              user: userArg
            });

            // Dispatch instant claim update event for immediate UI feedback
            // This will trigger the event handler which updates all state immediately
            const instantClaimUpdateEvent = new CustomEvent('instant-claim-update', {
              detail: {
                marketId: BigInt(marketId),
                user: userArg,
                amount: amount,
                claimedAt: claimedAtIso,
                txHash: log.transactionHash,
                source: 'blockchain-event',
                timestamp: Date.now(),
              }
            });
            window.dispatchEvent(instantClaimUpdateEvent);

            // Don't call loadClaimableRewards() here - it's slow and causes delay
            // The event handler already updates all state immediately
            // Background refresh every 30 seconds will catch any edge cases

          } catch (error) {
            console.warn('[ClaimPage] Failed to process redemption log:', error);
            continue;
          }
        }
      },
    });

    return () => {
      unwatchRedeemed?.();
    };
  }, [publicClient, address, loadClaimableRewards]);

  const handleClaim = useCallback(async (reward: ClaimableReward) => {
    if (!address) {
      alert('Please connect your wallet');
      return;
    }
    if (!publicClient) {
      alert('Unable to access RPC client. Please refresh and try again.');
      return;
    }

    setClaimingId(reward.marketId);

    try {
      const redeemHash = await writeContractAsync({
        address: addresses.core,
        abi: coreAbi,
        functionName: 'redeem',
        args: [BigInt(reward.marketId), reward.side === 'YES'],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: redeemHash });

      if (receipt?.status !== 'success') {
        throw new Error('Claim transaction failed or was reverted');
      }

      const block = receipt.blockNumber
        ? await publicClient.getBlock({ blockNumber: receipt.blockNumber })
        : null;
      const claimedAtIso = block?.timestamp
        ? new Date(Number(block.timestamp) * 1000).toISOString()
        : new Date().toISOString();

      const newlyClaimed: ClaimRecord[] = [];

      for (const log of receipt.logs ?? []) {
        if (!log || log.address?.toLowerCase() !== addresses.core.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: coreAbi,
            data: log.data,
            topics: log.topics,
          }) as { eventName: string; args: Record<string, unknown> };
          if (decoded.eventName !== 'Redeemed') continue;
          const args = decoded.args as Record<string, unknown>;
          const userArg = (args?.user as string | undefined)?.toLowerCase();
          if (!userArg || userArg !== address.toLowerCase()) continue;
          const idRaw = args?.id;
          if (idRaw === undefined || idRaw === null) continue;
          const marketId = Number(idRaw);
          if (!Number.isFinite(marketId)) continue;
          const usdcOutRaw = args?.usdcOut as bigint | undefined;
          if (usdcOutRaw === undefined) continue;
          const amount = Number(formatUnits(usdcOutRaw, 6));
          if (!Number.isFinite(amount) || amount <= 0) continue;
          newlyClaimed.push({
            marketId,
            user: address.toLowerCase(),
            amount,
            claimedAt: claimedAtIso,
          });
        } catch (error) {
          // silently ignore non-matching logs
          continue;
        }
      }

      if (newlyClaimed.length > 0) {
        // Dispatch immediate UI update event (similar to trading card)
        newlyClaimed.forEach(record => {
          const instantClaimUpdateEvent = new CustomEvent('instant-claim-update', {
            detail: {
              marketId: BigInt(record.marketId),
              user: record.user,
              amount: record.amount,
              claimedAt: record.claimedAt,
              txHash: redeemHash,
              source: 'claim-transaction'
            }
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(instantClaimUpdateEvent);
          }
        });

        // Update claim history immediately (event handler will also update, but this ensures immediate feedback)
        setClaimHistory(prev => {
          const existing = new Map(prev.map(entry => [entry.marketId, entry]));
          newlyClaimed.forEach(record => {
            existing.set(record.marketId, {
              marketId: record.marketId,
              question:
                record.marketId === reward.marketId ? reward.question : existing.get(record.marketId)?.question ?? '',
              resolvedDate: reward.resolvedDate,
              amount: record.amount,
              side: record.marketId === reward.marketId ? reward.side : (existing.get(record.marketId)?.side ?? 'YES'),
              winning: true,
              yesBalance: '0',
              noBalance: '0',
              yesPrice: record.marketId === reward.marketId ? reward.yesPrice : (existing.get(record.marketId)?.yesPrice ?? 0),
              noPrice: record.marketId === reward.marketId ? reward.noPrice : (existing.get(record.marketId)?.noPrice ?? 0),
              claimedAt: record.claimedAt,
            });
          });
          const next = Array.from(existing.values()).sort(
            (a, b) => parseDate(b.claimedAt ?? b.resolvedDate) - parseDate(a.claimedAt ?? a.resolvedDate),
          );
          if (typeof window !== 'undefined') {
            try {
              window.localStorage.setItem(getScopedStorageKey(), JSON.stringify(next));
            } catch (error) {
              console.error('Failed to update claimed rewards cache after claim', error);
            }
          }
          console.log('[ClaimPage] handleClaim updated claim history:', {
            totalItems: next.length,
            totalAmount: next.reduce((acc, r) => acc + r.amount, 0),
            newlyClaimed: newlyClaimed.length
          });
          return next;
        });
        setClaimedIds(prev => {
          const next = new Set(prev);
          newlyClaimed.forEach(record => next.add(record.marketId));
          console.log('[ClaimPage] handleClaim updated claimed IDs:', next.size);
          return next;
        });
        
        // Update claimable rewards - remove claimed markets
        setClaimableRewards(prev => {
          const filtered = prev.filter(entry => !newlyClaimed.some(record => record.marketId === entry.marketId));
          claimableRewardsRef.current = filtered; // Update ref
          const newAvailable = filtered.reduce((acc, reward) => acc + reward.amount, 0);
          setAvailableToClaim(newAvailable);
          console.log('[ClaimPage] handleClaim updated claimable rewards:', {
            before: prev.length,
            after: filtered.length,
            newAvailable
          });
          return filtered;
        });
        
        // Update state refs immediately
        claimableRewardsStateRef.current = claimableRewardsRef.current;
      }

      // Don't call loadClaimableRewards() here - it's slow and causes delay
      // The blockchain event watcher will handle instant updates
      // Background refresh every 30 seconds will catch any edge cases
    } catch (error: any) {
      console.error('Error claiming reward:', error);
      alert(`Failed to claim reward: ${error?.message || 'Unknown error'}`);
      return;
    } finally {
      setClaimingId(null);
    }
  }, [address, loadClaimableRewards, writeContractAsync, publicClient]);

  const formatUsd = (value: number) => {
    return value.toLocaleString(undefined, { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 6 
    });
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#F8F6FB] relative overflow-hidden">
        <Header />
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center bg-white rounded-2xl p-8 sm:p-12 shadow-xl border border-gray-100 max-w-2xl mx-auto"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-[#2DD4BF] to-[#14B8A6] rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">Connect Your Wallet</h2>
            <p className="text-sm sm:text-base md:text-lg text-gray-600 mb-6 sm:mb-8">Please connect your wallet to view and claim your rewards from resolved markets.</p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F6FB] relative overflow-hidden">
      <Header />
      
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 md:py-12">
        {/* Back Link */}
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Link href="/" className="inline-flex items-center text-[#2DD4BF] hover:text-[#14B8A6] mb-4 sm:mb-6 md:mb-8 font-semibold group text-sm sm:text-base">
            <motion.svg 
              className="w-4 h-4 sm:w-5 sm:h-5 mr-2 group-hover:-translate-x-1 transition-transform"
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </motion.svg>
            Back to Home
          </Link>
        </motion.div>

        {/* Page Title */}
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="mb-6 sm:mb-8 md:mb-12"
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 mb-3 sm:mb-4 tracking-tight">
            Claim Your Rewards
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-gray-600 max-w-2xl">
            Withdraw winnings from resolved prediction markets. Your funds are ready to claim instantly.
          </p>
        </motion.div>

        {/* Summary Cards */}
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8 md:mb-12"
        >
          {/* Available to Claim */}
          <motion.div 
            whileHover={{ y: -2, scale: 1.01 }}
            className="relative overflow-hidden bg-[#F0FDF4] rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 shadow-lg border border-gray-100"
          >
            <div className="flex items-start justify-between mb-3 sm:mb-4">
              <h3 className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wider">Available to Claim</h3>
              <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-[#2DD4BF]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[#2DD4BF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                </svg>
              </div>
            </div>
            <motion.div 
              key={availableToClaim}
              initial={{ scale: 1.1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-3xl sm:text-4xl md:text-5xl font-black text-[#2DD4BF] mb-2 sm:mb-3"
            >
              ${formatUsd(availableToClaim)}
            </motion.div>
            <p className="text-xs sm:text-sm text-gray-500">
              {claimableRewards.length} {claimableRewards.length === 1 ? 'market' : 'markets'} ready for withdrawal
            </p>
          </motion.div>

          {/* Total Claimed */}
          <motion.div 
            whileHover={{ y: -2, scale: 1.01 }}
            className="relative overflow-hidden bg-[#F0FDF4] rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 shadow-lg border border-gray-100"
          >
            <div className="flex items-start justify-between mb-3 sm:mb-4">
              <h3 className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wider">Total Claimed</h3>
              <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <div className="text-3xl sm:text-4xl md:text-5xl font-black text-gray-900 mb-2 sm:mb-3" key={`total-${totalClaimed}`}>
              ${formatUsd(totalClaimed)}
            </div>
            <p className="text-xs sm:text-sm text-gray-500">All-time earnings withdrawn</p>
          </motion.div>
        </motion.div>

        {/* Tabs */}
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex gap-4 sm:gap-6 mb-6 sm:mb-8 border-b border-gray-200"
        >
          <button
            onClick={() => setActiveTab('available')}
            className={`relative pb-3 sm:pb-4 font-semibold text-sm sm:text-base transition-all ${
              activeTab === 'available'
                ? 'text-[#2DD4BF]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Available to Claim
            {activeTab === 'available' && (
              <motion.div
                layoutId="activeTabUnderline"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2DD4BF]"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`relative pb-3 sm:pb-4 font-semibold text-sm sm:text-base transition-all ${
              activeTab === 'history'
                ? 'text-[#2DD4BF]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Claim History
            {activeTab === 'history' && (
              <motion.div
                layoutId="activeTabUnderline"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2DD4BF]"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </button>
        </motion.div>

        {/* Rewards List */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-20"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="inline-block w-16 h-16 border-4 border-[#14B8A6] border-t-transparent rounded-full"
              />
              <p className="mt-6 text-lg font-semibold text-gray-600">Loading claimable rewards...</p>
            </motion.div>
          ) : activeTab === 'available' ? (
            <motion.div
              key="available"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {claimableRewards.length === 0 ? (
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white rounded-2xl p-16 shadow-lg border border-gray-100 text-center"
                >
                  <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mb-3">No rewards available</p>
                  <p className="text-gray-600 mb-8">You don&apos;t have any claimable rewards from resolved markets.</p>
                  <Link
                    href="/markets"
                    className="inline-flex items-center justify-center px-8 py-3 bg-gradient-to-r from-[#14B8A6] to-[#0D9488] text-white font-bold rounded-lg hover:shadow-lg transition-all"
                  >
                    Explore Markets
                    <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                </motion.div>
              ) : (
                claimableRewards.map((reward, index) => (
                  <motion.div
                    key={reward.marketId}
                    initial={{ x: -50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ y: -2, scale: 1.01 }}
                    className="bg-[#F0FDF4] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg border border-gray-100 hover:border-[#2DD4BF] transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-3 sm:mb-4">
                          <motion.span 
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="px-2 sm:px-3 py-1 bg-[#2DD4BF] text-white text-[10px] sm:text-xs font-bold rounded-full uppercase tracking-wide"
                          >
                            Claimable
                          </motion.span>
                          <span className="px-2 sm:px-3 py-1 bg-green-50 text-green-700 text-[10px] sm:text-xs font-semibold rounded-full border border-green-200">
                            You bet {reward.side} - {reward.side} won
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 mb-2 sm:mb-3 line-clamp-2">{reward.question}</h3>
                        <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">
                          Resolved: {reward.resolvedDate}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-col items-end sm:items-end gap-3 sm:gap-4 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900">
                            ${formatUsd(reward.amount)}
                          </div>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleClaim(reward)}
                          disabled={
                            isPending ||
                            claimingId === reward.marketId ||
                            claimedIds.has(reward.marketId)
                          }
                          className="px-4 sm:px-6 md:px-8 py-2 sm:py-3 md:py-4 bg-[#2DD4BF] hover:bg-[#14B8A6] text-white rounded-lg sm:rounded-xl font-bold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap shadow-md text-xs sm:text-sm md:text-base"
                        >
                          {claimingId === reward.marketId ? (
                            <span className="flex items-center gap-2">
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                              />
                              Claiming...
                            </span>
                          ) : claimedIds.has(reward.marketId) ? (
                            'Claimed'
                          ) : (
                            'Claim Reward'
                          )}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          ) : (
            <motion.div
              key={`history-${claimHistory.length}-${totalClaimed}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {claimHistory.length === 0 ? (
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white rounded-2xl p-16 shadow-lg border border-gray-100 text-center"
                >
                  <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mb-3">No claim history</p>
                  <p className="text-gray-600">Your claimed rewards will appear here.</p>
                </motion.div>
              ) : (
                claimHistory.map((reward, index) => (
                  <motion.div
                    key={reward.marketId}
                    initial={{ x: -50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-[#F0FDF4] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg border border-gray-100"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-3 sm:mb-4">
                          <span className="px-2 sm:px-3 py-1 bg-gray-200 text-gray-700 text-[10px] sm:text-xs font-bold rounded-full uppercase tracking-wide">
                            Claimed
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 mb-2 sm:mb-3">{reward.question}</h3>
                        <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">
                          Claimed: {reward.resolvedDate}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-col items-end sm:items-end gap-3 sm:gap-4 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900">
                            ${formatUsd(reward.amount)}
                          </div>
                        </div>
                        <div className="px-4 sm:px-6 md:px-8 py-2 sm:py-3 md:py-4 bg-gray-200 text-gray-600 rounded-lg sm:rounded-xl font-bold whitespace-nowrap text-xs sm:text-sm md:text-base">
                          ✓ Claimed
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}