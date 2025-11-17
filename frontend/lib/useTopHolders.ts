'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { fetchSubgraph } from './subgraphClient';

export interface Holder {
  address: string;
  balance: string;
  balanceUsd: number;
}

type HolderSide = 'yes' | 'no';

export function useTopHolders(
  marketId: number | null,
  currentPrice: number,
  side: HolderSide,
) {
  const queryClient = useQueryClient();

  return useQuery<Holder[]>({
    queryKey: ['topHolders', marketId, side],
    enabled: marketId !== null && marketId >= 0,
    staleTime: 60_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      if (marketId === null || marketId < 0) return [];

      const previous =
        queryClient.getQueryData<Holder[]>(['topHolders', marketId, side]) ?? [];

      try {
        const data = await fetchSubgraph<{
          positionBalances: Array<{
            id: string;
            user: string;
            tokenBalance: string;
          }>;
        }>(
          `
            query TopHolders($marketId: ID!, $side: String!) {
              positionBalances(
                where: { market: $marketId, side: $side, tokenBalance_gt: "0" }
                orderBy: tokenBalance
                orderDirection: desc
                first: 20
              ) {
                id
                user
                tokenBalance
              }
            }
          `,
          {
            marketId: marketId.toString(),
            side,
          },
        );

        const holders = (data.positionBalances ?? [])
          .map(holder => {
            if (!holder?.user || !holder?.tokenBalance) {
              return null;
            }

            let tokenBalance = 0;
            try {
              tokenBalance = Number(formatUnits(BigInt(holder.tokenBalance), 18));
            } catch (error) {
              console.warn('[useTopHolders] Failed to parse token balance', error);
              return null;
            }
            if (!Number.isFinite(tokenBalance) || tokenBalance <= 0) {
              return null;
            }
            const price =
              side === 'yes'
                ? currentPrice
                : Math.max(0, 1 - currentPrice);
            return {
              address: holder.user.toLowerCase(),
              balance: tokenBalance.toString(),
              balanceUsd: tokenBalance * price,
            };
          })
          .filter((holder): holder is Holder => holder !== null);

        const merged = new Map<string, Holder>();
        previous.forEach(holder => merged.set(holder.address, holder));
        holders.forEach(holder => merged.set(holder.address, holder));

        return Array.from(merged.values()).sort(
          (a, b) => parseFloat(b.balance) - parseFloat(a.balance),
        );
      } catch (error) {
        console.warn('[useTopHolders] Failed to load holders from subgraph', error);
        return previous;
      }
    },
  });
}
