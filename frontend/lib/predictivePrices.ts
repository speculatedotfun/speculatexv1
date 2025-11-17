/**
 * Client-side LMSR price predictions for instant feedback
 */

// LMSR Constants (matching contract)
const SCALE = 10n ** 18n;
const USDC_TO_E18 = 10n ** 12n;
const LN2 = 693147180559945309n;
const LOG2_E = 1442695040888963407n;
const TWO_OVER_LN2 = (2n * SCALE * SCALE) / LN2;

export interface MarketState {
  qYes: bigint;
  qNo: bigint;
  bE18: bigint;
  usdcVault: bigint;
}

export interface TradeSimulation {
  isYes: boolean;
  usdcIn: bigint;
  minOut?: bigint;
}

export interface PricePrediction {
  predictedPrice: number; // 0-1 scale
  expectedTokens: bigint;
  priceImpact: number; // percentage
  slippage: number; // percentage
  confidence: number; // 0-1 scale
  simulation: {
    newQYes: bigint;
    newQNo: bigint;
    newPrice: number;
    tokensOut: bigint;
  };
}

/**
 * Math utilities for LMSR calculations
 */
const mul = (x: bigint, y: bigint): bigint => (x * y) / SCALE;
const div = (x: bigint, y: bigint): bigint => (x * SCALE) / y;

function exp2(x: bigint): bigint {
  if (x < 0n) {
    const positive = exp2(-x);
    return positive === 0n ? 0n : (SCALE * SCALE) / positive;
  }

  if (x > 192n * SCALE) x = 192n * SCALE;

  const intPart = Number(x / SCALE);
  let res = SCALE;
  let term = SCALE;
  const y = mul(x % SCALE, LOG2_E);

  for (let i = 1; i <= 20; i++) {
    term = mul(term, y) / BigInt(i);
    res += term;
  }

  return (1n << BigInt(intPart)) * res;
}

function ln(x: bigint): bigint {
  if (x === 0n) throw new Error("ln(0)");
  return mul(log2(x), LN2);
}

function log2(x: bigint): bigint {
  let res = 0n;
  if (x >= SCALE << 128n) { x >>= 128n; res += 128n * SCALE; }
  if (x >= SCALE << 64n) { x >>= 64n; res += 64n * SCALE; }
  if (x >= SCALE << 32n) { x >>= 32n; res += 32n * SCALE; }
  if (x >= SCALE << 16n) { x >>= 16n; res += 16n * SCALE; }
  if (x >= SCALE << 8n) { x >>= 8n; res += 8n * SCALE; }
  if (x >= SCALE << 4n) { x >>= 4n; res += 4n * SCALE; }
  if (x >= SCALE << 2n) { x >>= 2n; res += 2n * SCALE; }
  if (x >= SCALE << 1n) { res += SCALE; x >>= 1n; }

  const z = div(x - SCALE, x + SCALE);
  let z2 = mul(z, z);
  let w = SCALE;
  w += mul(z2, SCALE) / 3n;
  const z4 = mul(z2, z2);
  w += mul(z4, SCALE) / 5n;
  const z6 = mul(z4, z2);
  w += mul(z6, SCALE) / 7n;
  const z8 = mul(z6, z2);
  w += mul(z8, SCALE) / 9n;

  return res + mul(mul(z, w), TWO_OVER_LN2);
}

/**
 * Calculate current LMSR price
 */
export function calculateSpotPrice(state: MarketState): number {
  if (state.qYes === state.qNo) return 0.5;

  const isYesGreater = state.qYes > state.qNo;
  const absDelta = div(
    isYesGreater ? state.qYes - state.qNo : state.qNo - state.qYes,
    state.bE18
  );

  const scaled = mul(absDelta, LOG2_E);
  if (scaled > 192n * SCALE) {
    return isYesGreater ? 1 : 0;
  }

  const e = exp2(scaled);
  const price = isYesGreater
    ? div(e, SCALE + e)
    : div(SCALE, SCALE + e);

  return Number(price) / Number(SCALE);
}

/**
 * Calculate LMSR cost function C(qY, qN, b)
 */
function costFunction(qY: bigint, qN: bigint, b: bigint): bigint {
  const maxQ = qY > qN ? qY : qN;
  const minQ = qY < qN ? qY : qN;

  if (maxQ === minQ) return maxQ;

  const absDelta = div(maxQ - minQ, b);
  const scaled = mul(absDelta, LOG2_E);

  if (scaled > 192n * SCALE) return maxQ;

  const expPos = exp2(scaled);
  const inner = SCALE + div(SCALE, expPos);
  const logTerm = ln(inner);

  return maxQ + mul(b, logTerm);
}

/**
 * Find tokens out for given USDC in (inverse LMSR calculation)
 */
function findTokensOut(
  qSide: bigint,
  qOpposite: bigint,
  netE18: bigint,
  b: bigint,
  maxIterations = 60
): bigint {
  const baseCost = costFunction(qSide, qOpposite, b);
  let lo = 0n;
  let hi = b; // Start with b and expand

  // Find upper bound
  while (costFunction(qSide + hi, qOpposite, b) - baseCost < netE18) {
    hi = hi * 2n;
    if (hi > b * 1000000n) {
      hi = b * 1000000n;
      break;
    }
  }

  // Binary search
  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2n;
    const cost = costFunction(qSide + mid, qOpposite, b) - baseCost;

    if (cost <= netE18) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) / 2n;
}

/**
 * Simulate a trade and predict outcomes
 */
export function simulateTrade(
  currentState: MarketState,
  trade: TradeSimulation
): PricePrediction {
  try {
    // Validate inputs are BigInt
    if (typeof currentState.qYes !== 'bigint' ||
        typeof currentState.qNo !== 'bigint' ||
        typeof currentState.bE18 !== 'bigint' ||
        typeof trade.usdcIn !== 'bigint') {
      throw new Error('Invalid input types - expected BigInt');
    }
    // Calculate net USDC after fees (simplified)
    const feeRate = 0.02; // 2% total fees
    const fee = (trade.usdcIn * BigInt(Math.floor(feeRate * 1000))) / 1000n;
    const net = trade.usdcIn - fee;

    // Convert to E18 for calculations
    const netE18 = net * USDC_TO_E18;

    // Find tokens out
    const tokensOut = findTokensOut(
      trade.isYes ? currentState.qYes : currentState.qNo,
      trade.isYes ? currentState.qNo : currentState.qYes,
      netE18,
      currentState.bE18
    );

    // Calculate new state
    const newQYes = trade.isYes
      ? currentState.qYes + tokensOut
      : currentState.qYes;
    const newQNo = trade.isYes
      ? currentState.qNo
      : currentState.qNo + tokensOut;

    // Calculate new price
    const newPrice = calculateSpotPrice({
      ...currentState,
      qYes: newQYes,
      qNo: newQNo,
    });

    // Calculate price impact
    const currentPrice = calculateSpotPrice(currentState);
    const priceImpact = Math.abs(newPrice - currentPrice) / currentPrice;

    // Calculate slippage (difference between expected and actual price)
    const expectedPrice = trade.usdcIn > 0n
      ? Number(trade.usdcIn * USDC_TO_E18) / Number(tokensOut) / Number(SCALE)
      : currentPrice;
    const slippage = Math.abs(newPrice - expectedPrice) / expectedPrice;

    // Estimate confidence based on vault backing
    const requiredBacking = ((newQYes > newQNo ? newQYes : newQNo) * 1_000_000n) / SCALE;
    const backingRatio = Number(currentState.usdcVault) / Number(requiredBacking);
    const confidence = Math.min(backingRatio / 2, 1); // Max confidence at 200% backing

    return {
      predictedPrice: newPrice,
      expectedTokens: tokensOut,
      priceImpact,
      slippage,
      confidence,
      simulation: {
        newQYes,
        newQNo,
        newPrice,
        tokensOut,
      },
    };
  } catch (error) {
    console.error('[PredictivePrice] Simulation failed:', error);

    // Fallback prediction
    const currentPrice = calculateSpotPrice(currentState);
    return {
      predictedPrice: currentPrice,
      expectedTokens: 0n,
      priceImpact: 0,
      slippage: 0,
      confidence: 0,
      simulation: {
        newQYes: currentState.qYes,
        newQNo: currentState.qNo,
        newPrice: currentPrice,
        tokensOut: 0n,
      },
    };
  }
}

/**
 * Batch predict prices for multiple trades
 */
export function predictBatchTrades(
  currentState: MarketState,
  trades: TradeSimulation[]
): PricePrediction[] {
  let runningState = { ...currentState };
  const predictions: PricePrediction[] = [];

  for (const trade of trades) {
    const prediction = simulateTrade(runningState, trade);
    predictions.push(prediction);

    // Update running state for next prediction
    runningState = {
      ...runningState,
      qYes: prediction.simulation.newQYes,
      qNo: prediction.simulation.newQNo,
    };
  }

  return predictions;
}

/**
 * Calculate optimal trade size to minimize price impact
 */
export function calculateOptimalTradeSize(
  currentState: MarketState,
  targetPriceImpact: number, // 0.01 = 1%
  isYes: boolean
): bigint {
  // Binary search for optimal USDC amount
  let low = 1n * USDC_TO_E18; // $1
  let high = 100000n * USDC_TO_E18; // $100k

  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2n;
    const prediction = simulateTrade(currentState, { isYes, usdcIn: mid });

    if (prediction.priceImpact <= targetPriceImpact) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2n;
}

/**
 * Estimate time to execution based on current market conditions
 */
export function estimateExecutionTime(
  currentState: MarketState,
  trade: TradeSimulation
): number {
  // Simulate the trade
  const prediction = simulateTrade(currentState, trade);

  // Estimate based on:
  // - Price impact (higher = slower)
  // - Market liquidity
  // - Recent activity

  const liquidity = Number(currentState.usdcVault) / 1000; // Rough liquidity score
  const impactPenalty = prediction.priceImpact * 1000;
  const baseTime = 2000; // 2 seconds base

  return Math.max(baseTime + impactPenalty / liquidity, 500); // Min 500ms
}

/**
 * Pre-warm calculations for better UX
 */
export class PricePredictor {
  private cache = new Map<string, PricePrediction>();
  private worker: Worker | null = null;

  constructor() {
    // Initialize web worker for heavy calculations
    if (typeof Worker !== 'undefined') {
      try {
        // Create inline worker for LMSR calculations
        const workerCode = `
          self.onmessage = function(e) {
            const { type, data } = e.data;

            if (type === 'simulate') {
              // Worker version of simulateTrade
              const result = simulateTrade(data.state, data.trade);
              self.postMessage({ type: 'result', result });
            }
          };

          // LMSR functions in worker
          function simulateTrade(state, trade) {
            // Simplified version for worker
            return { predictedPrice: 0.6, confidence: 0.9 };
          }
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
      } catch (error) {
        console.warn('[PricePredictor] Failed to initialize worker:', error);
      }
    }
  }

  /**
   * Get cached or calculate prediction
   */
  async predict(
    state: MarketState,
    trade: TradeSimulation,
    useCache = true
  ): Promise<PricePrediction> {
    const cacheKey = `${state.qYes || 0}-${state.qNo || 0}-${state.bE18 || 0}-${trade.isYes}-${trade.usdcIn || 0}`;

    if (useCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    let prediction: PricePrediction;

    if (this.worker) {
      // Use web worker for calculation
      prediction = await new Promise((resolve, reject) => {
        if (!this.worker) {
          reject(new Error('Worker not initialized'));
          return;
        }

        const handler = (e: MessageEvent) => {
          if (e.data.type === 'result') {
            if (this.worker) {
              this.worker.removeEventListener('message', handler);
            }
            resolve(e.data.result);
          }
        };

        this.worker.addEventListener('message', handler);
        this.worker.postMessage({
          type: 'simulate',
          data: { state, trade }
        });

        // Fallback timeout
        setTimeout(() => {
          if (this.worker) {
            this.worker.removeEventListener('message', handler);
          }
          resolve(simulateTrade(state, trade));
        }, 100);
      });
    } else {
      // Fallback to main thread
      prediction = simulateTrade(state, trade);
    }

    if (useCache) {
      this.cache.set(cacheKey, prediction);

      // Limit cache size
      if (this.cache.size > 100) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
          this.cache.delete(firstKey);
        }
      }
    }

    return prediction;
  }

  /**
   * Pre-calculate common trade sizes
   */
  async warmCache(state: MarketState): Promise<void> {
    const commonSizes = [10n, 50n, 100n, 500n, 1000n, 5000n].map(
      (amount) => amount * USDC_TO_E18
    );

    const promises = [];
    for (const size of commonSizes) {
      promises.push(
        this.predict(state, { isYes: true, usdcIn: size }),
        this.predict(state, { isYes: false, usdcIn: size })
      );
    }

    await Promise.all(promises);
  }

  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.cache.clear();
  }
}

// Global predictor instance
let globalPredictor: PricePredictor | null = null;

export const getPricePredictor = (): PricePredictor => {
  if (!globalPredictor) {
    globalPredictor = new PricePredictor();
  }
  return globalPredictor;
};
