import { Address, BigInt, Bytes } from '@graphprotocol/graph-ts';
import {
  MarketCreated,
  Buy,
  Sell,
  Redeemed,
  MarketResolved,
} from '../generated/SpeculateCore/SpeculateCore';
import {
  Market,
  Trade,
  PositionBalance,
  Redemption,
  User,
  GlobalState,
} from '../generated/schema';

const NEG_ONE = BigInt.fromI32(-1);
const GLOBAL_ID = 'global';

function getOrCreateGlobalState(): GlobalState {
  let state = GlobalState.load(GLOBAL_ID);
  if (state === null) {
    state = new GlobalState(GLOBAL_ID);
    state.uniqueTraders = 0;
  }
  return state as GlobalState;
}

function getOrCreateUser(address: Address): User {
  const id = address.toHexString();
  let user = User.load(id);
  if (user === null) {
    user = new User(id);
    user.save();

    const globalState = getOrCreateGlobalState();
    globalState.uniqueTraders = globalState.uniqueTraders + 1;
    globalState.save();
  }
  return user as User;
}

function getOrCreatePositionBalance(
  marketId: string,
  userId: string,
  side: string,
): PositionBalance {
  const id = marketId + '-' + userId + '-' + side;
  let balance = PositionBalance.load(id);
  if (balance === null) {
    balance = new PositionBalance(id);
    balance.market = marketId;
    balance.user = userId;
    balance.side = side;
    balance.tokenBalance = BigInt.fromI32(0);
  }
  return balance as PositionBalance;
}

function createTradeId(txHash: Bytes, logIndex: BigInt): string {
  return txHash.toHexString() + '-' + logIndex.toString();
}

function subtractSafely(value: BigInt, decrement: BigInt): BigInt {
  if (value.ge(decrement)) {
    return value.minus(decrement);
  }
  return BigInt.fromI32(0);
}

export function handleMarketCreated(event: MarketCreated): void {
  const marketId = event.params.id.toString();
  let market = Market.load(marketId);
  if (market !== null) {
    return;
  }

  market = new Market(marketId);
  market.yesToken = event.params.yes;
  market.noToken = event.params.no;
  market.question = event.params.question;
  market.initUsdc = event.params.initUsdc;
  market.expiryTimestamp = event.params.expiryTimestamp;
  market.createdAt = event.block.timestamp;
  market.blockNumber = event.block.number;
  market.txHash = event.transaction.hash;
  market.totalVolumeUsdc = BigInt.fromI32(0);
  market.totalTokensYes = BigInt.fromI32(0);
  market.totalTokensNo = BigInt.fromI32(0);
  market.isResolved = false;
  market.save();
}

export function handleBuy(event: Buy): void {
  const marketId = event.params.id.toString();
  const market = Market.load(marketId);
  if (market === null) {
    return;
  }

  const user = getOrCreateUser(event.params.user);
  const trade = new Trade(createTradeId(event.transaction.hash, event.logIndex));
  trade.market = marketId;
  trade.txHash = event.transaction.hash;
  trade.logIndex = event.logIndex;
  trade.blockNumber = event.block.number;
  trade.timestamp = event.block.timestamp;
  trade.user = user.id;
  trade.action = 'buy';
  trade.side = event.params.isYes ? 'yes' : 'no';
  trade.tokenDelta = event.params.tokensOut;
  trade.usdcDelta = event.params.usdcIn.times(NEG_ONE);
  trade.priceE6 = event.params.priceE6;
  trade.save();

  market.totalVolumeUsdc = market.totalVolumeUsdc.plus(event.params.usdcIn);
  if (event.params.isYes) {
    market.totalTokensYes = market.totalTokensYes.plus(event.params.tokensOut);
  } else {
    market.totalTokensNo = market.totalTokensNo.plus(event.params.tokensOut);
  }
  market.save();

  const balance = getOrCreatePositionBalance(marketId, user.id, trade.side);
  balance.tokenBalance = balance.tokenBalance.plus(event.params.tokensOut);
  balance.save();
}

export function handleSell(event: Sell): void {
  const marketId = event.params.id.toString();
  const market = Market.load(marketId);
  if (market === null) {
    return;
  }

  const user = getOrCreateUser(event.params.user);
  const trade = new Trade(createTradeId(event.transaction.hash, event.logIndex));
  trade.market = marketId;
  trade.txHash = event.transaction.hash;
  trade.logIndex = event.logIndex;
  trade.blockNumber = event.block.number;
  trade.timestamp = event.block.timestamp;
  trade.user = user.id;
  trade.action = 'sell';
  trade.side = event.params.isYes ? 'yes' : 'no';
  trade.tokenDelta = event.params.tokensIn.times(NEG_ONE);
  trade.usdcDelta = event.params.usdcOut;
  trade.priceE6 = event.params.priceE6;
  trade.save();

  market.totalVolumeUsdc = market.totalVolumeUsdc.plus(event.params.usdcOut);
  if (event.params.isYes) {
    market.totalTokensYes = subtractSafely(market.totalTokensYes, event.params.tokensIn);
  } else {
    market.totalTokensNo = subtractSafely(market.totalTokensNo, event.params.tokensIn);
  }
  market.save();

  const balance = getOrCreatePositionBalance(marketId, user.id, trade.side);
  balance.tokenBalance = subtractSafely(balance.tokenBalance, event.params.tokensIn);
  balance.save();
}

export function handleRedeemed(event: Redeemed): void {
  const marketId = event.params.id.toString();
  const market = Market.load(marketId);
  if (market === null) {
    return;
  }

  const user = getOrCreateUser(event.params.user);
  const redemption = new Redemption(createTradeId(event.transaction.hash, event.logIndex));
  redemption.market = marketId;
  redemption.user = user.id;
  redemption.amount = event.params.usdcOut;
  redemption.txHash = event.transaction.hash;
  redemption.blockNumber = event.block.number;
  redemption.timestamp = event.block.timestamp;
  redemption.save();
}

export function handleMarketResolved(event: MarketResolved): void {
  const marketId = event.params.id.toString();
  const market = Market.load(marketId);
  if (market === null) {
    return;
  }

  market.isResolved = true;
  market.yesWins = event.params.yesWins;
  market.resolutionTimestamp = event.block.timestamp;
  market.resolutionTxHash = event.transaction.hash;
  market.save();
}

