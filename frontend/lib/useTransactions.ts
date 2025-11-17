import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSubgraph } from './subgraphClient';
import type { TradeRecord } from './priceHistory/types';

export interface Transaction {
  id: string;
  type: 'BuyYes' | 'BuyNo' | 'SellYes' | 'SellNo';
  user: string;
  amount: string;
  output: string;
  price: string;
  timestamp: number;
  txHash: string;
}

function absString(value: string) {
  return value.startsWith('-') ? value.slice(1) : value;
}

const mapTradeToTransaction = (trade: TradeRecord): Transaction | null => {
  const type =
    trade.action === 'buy'
      ? trade.side === 'yes'
        ? 'BuyYes'
        : 'BuyNo'
      : trade.side === 'yes'
        ? 'SellYes'
        : 'SellNo';

  const amount =
    trade.action === 'buy'
      ? absString(trade.usdcDelta)
      : absString(trade.tokenDelta);
  const output =
    trade.action === 'buy'
      ? absString(trade.tokenDelta)
      : absString(trade.usdcDelta);

  if (!trade.txHash) return null;

  return {
    id: `${trade.txHash}-${type}`,
    type,
    user: trade.user,
    amount,
    output,
    price: trade.price,
    timestamp: trade.timestamp,
    txHash: trade.txHash,
  };
};

export function useTransactions(marketId: number | null) {
  const queryClient = useQueryClient();

  return useQuery<Transaction[]>({
    queryKey: ['transactions', marketId],
    enabled: marketId !== null && marketId >= 0,
    staleTime: 60_000,
    refetchInterval: 30_000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      if (marketId === null || marketId < 0) return [];

      const previous =
        queryClient.getQueryData<Transaction[]>(['transactions', marketId]) ?? [];
      
      try {
        const data = await fetchSubgraph<{
          trades: Array<{
            id: string;
            txHash: string;
            timestamp: string;
            user: string;
            action: string;
            side: string;
            usdcDelta: string;
            tokenDelta: string;
            priceE6: string;
          }>;
        }>(
          `
            query MarketTrades($marketId: ID!) {
              trades(
                where: { market: $marketId }
                orderBy: timestamp
                orderDirection: desc
                first: 200
              ) {
                id
                txHash
                timestamp
                user
                action
                side
                usdcDelta
                tokenDelta
                priceE6
              }
            }
          `,
          { marketId: marketId.toString() },
        );

        const trades: TradeRecord[] = (data.trades ?? [])
          .map(trade => {
            if (!trade?.user || !trade?.txHash) {
              return null;
            }

            return {
              txHash: trade.txHash,
              timestamp: Number(trade.timestamp ?? 0),
              user: trade.user.toLowerCase(),
              action: trade.action === 'buy' ? 'buy' : 'sell',
              side: trade.side === 'yes' ? 'yes' : 'no',
              tokenDelta: trade.tokenDelta ?? '0',
              usdcDelta: trade.usdcDelta ?? '0',
              price: Number.isFinite(Number(trade.priceE6))
                ? (Number(trade.priceE6) / 1e6).toString()
                : '0',
            } satisfies TradeRecord;
          })
          .filter((trade): trade is TradeRecord => trade !== null);

        const merged = [...previous];
        const existing = new Map<string, Transaction>();
        merged.forEach(tx => existing.set(tx.id, tx));

        trades.forEach(trade => {
          const tx = mapTradeToTransaction(trade);
          if (tx) {
            existing.set(tx.id, tx);
          }
        });

        return Array.from(existing.values()).sort((a, b) => b.timestamp - a.timestamp);
      } catch (error) {
        console.warn('[useTransactions] Failed to load trades from subgraph', error);
        return previous;
      }
    },
  });
}
