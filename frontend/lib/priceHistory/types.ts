export interface PricePoint {
  timestamp: number;
  priceYes: number;
  priceNo: number;
  txHash?: string;
}

export type TradeAction = 'buy' | 'sell';
export type TradeSide = 'yes' | 'no';

export interface TradeRecord {
  txHash: string;
  timestamp: number;
  user: string;
  action: TradeAction;
  side: TradeSide;
  tokenDelta: string; // positive for buys, negative for sells (18 decimals as string)
  usdcDelta: string; // negative for buys (spent), positive for sells (received) (6 decimals as string)
  price: string; // priceYes expressed in decimal string
}

export interface ClaimRecord {
  marketId: number;
  user: string;
  amount: number;
  claimedAt: string;
}



