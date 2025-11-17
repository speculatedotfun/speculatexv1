// LMSR (Logarithmic Market Scoring Rule) Math Functions
// These implement the core AMM pricing algorithm

const SCALE = 10n ** 18n;
const USDC_TO_E18 = 10n ** 12n;
const LN2 = 693147180559945309n;
const LOG2_E = 1442695040888963407n;
const TWO_OVER_LN2 = (2n * SCALE * SCALE) / LN2;
const MAX_SEARCH_ITERATIONS = 60;

export const SLIPPAGE_BPS = 50n; // 0.50% slippage buffer
export const SAFETY_MARGIN_BPS = 9800n; // 98% of cap to stay under jump limit
export const MIN_USDC_OUT_E6 = 1_000n; // $0.001

export function mul(x: bigint, y: bigint): bigint {
  return (x * y) / SCALE;
}

export function div(x: bigint, y: bigint): bigint {
  if (y === 0n) return 0n;
  return (x * SCALE) / y;
}

export function exp2(x: bigint): bigint {
  if (x < 0n) {
    const positive = exp2(-x);
    if (positive === 0n) return 0n;
    return (SCALE * SCALE) / positive;
  }

  if (x > 192n * SCALE) {
    x = 192n * SCALE;
  }

  const intPart = x / SCALE;
  const frac = x % SCALE;
  let res = SCALE;
  let term = SCALE;
  const y = mul(frac, LN2);

  for (let i = 1n; i <= 20n; i++) {
    term = (term * y) / SCALE / i;
    res += term;
    if (term === 0n) break;
  }

  const pow = 1n << intPart;
  return pow * res;
}

export function log2(x: bigint): bigint {
  if (x <= 0n) {
    throw new Error('log2 undefined');
  }

  let res = 0n;
  let value = x;

  const shiftChecks: Array<[bigint, bigint]> = [
    [128n, 128n * SCALE],
    [64n, 64n * SCALE],
    [32n, 32n * SCALE],
    [16n, 16n * SCALE],
    [8n, 8n * SCALE],
    [4n, 4n * SCALE],
    [2n, 2n * SCALE],
    [1n, SCALE],
  ];

  for (const [shift, add] of shiftChecks) {
    if (value >= (SCALE << shift)) {
      value >>= shift;
      res += add;
    }
  }

  const numerator = value - SCALE;
  const denominator = value + SCALE;
  const z = denominator === 0n ? 0n : div(numerator, denominator);
  const z2 = mul(z, z);
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

export function ln(x: bigint): bigint {
  return mul(log2(x), LN2);
}

export function costFunction(qYes: bigint, qNo: bigint, b: bigint): bigint {
  if (b === 0n) throw new Error('invalid liquidity');
  
  // LMSR cost function: C(q) = max(qY,qN) + b * ln(1 + exp(|qY - qN| / b))
  const maxQ = qYes > qNo ? qYes : qNo;
  const minQ = qYes < qNo ? qYes : qNo;
  const pos = div(maxQ - minQ, b);
  const scaled = mul(pos, LOG2_E);
  
  if (scaled > 192n * SCALE) {
    // exp(pos) too large; ln(1 + exp(-pos)) ≈ 0
    return maxQ;
  }
  
  const expPos = exp2(scaled);
  const inner = SCALE + div(SCALE, expPos);  // 1 + exp(-pos)
  return maxQ + mul(b, ln(inner));
}

export function spotPriceYesE18(qYes: bigint, qNo: bigint, b: bigint): bigint {
  if (b === 0n) return SCALE / 2n;
  
  // Match contract's _spotYesFromQ formula:
  // price = e / (1 + e) where e = 2^(|qY - qN| * log2(e) / b)
  if (qYes === qNo) return SCALE / 2n;  // 0.5
  
  const yGreater = qYes > qNo;
  const absDelta = yGreater ? qYes - qNo : qNo - qYes;
  const absDeltaScaled = div(absDelta, b);
  const scaled = mul(absDeltaScaled, LOG2_E);
  
  if (scaled > 192n * SCALE) {
    return yGreater ? SCALE : 0n;
  }
  
  const e = exp2(scaled);
  return yGreater ? div(e, SCALE + e) : div(SCALE, SCALE + e);
}

export function findSharesOut(
  qSide: bigint,
  qOther: bigint,
  netE18: bigint,
  b: bigint,
): bigint {
  if (b === 0n) throw new Error('invalid liquidity');

  const baseCost = costFunction(qSide, qOther, b);

  let lo = 0n;
  let hi = b === 0n ? 1n * SCALE : b;

  for (let i = 0; i < 32; i++) {
    const newCost = costFunction(qSide + hi, qOther, b);
    const delta = newCost - baseCost;
    if (delta >= netE18) break;
    lo = hi;
    hi = hi * 2n;
  }

  if (hi === 0n) hi = 1n * SCALE;

  for (let i = 0; i < MAX_SEARCH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2n;
    const newCost = costFunction(qSide + mid, qOther, b);
    const delta = newCost - baseCost;
    if (delta <= netE18) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) / 2n;
}

export function simulateBuyChunk(
  usdcIn: bigint,
  qYes: bigint,
  qNo: bigint,
  bE18: bigint,
  feeTreasuryBps: number,
  feeVaultBps: number,
  feeLpBps: number,
  isYes: boolean,
) {
  if (usdcIn <= 0n || bE18 === 0n) return null;

  const feeT = usdcIn * BigInt(feeTreasuryBps) / 10_000n;
  const feeV = usdcIn * BigInt(feeVaultBps) / 10_000n;
  const feeL = usdcIn * BigInt(feeLpBps) / 10_000n;
  const net = usdcIn - feeT - feeV - feeL;
  if (net <= 0n) return null;

  const netE18 = net * USDC_TO_E18;
  const baseSide = isYes ? qYes : qNo;
  const baseOther = isYes ? qNo : qYes;
  const tokensOut = findSharesOut(baseSide, baseOther, netE18, bE18);
  if (tokensOut <= 0n) return null;

  const slippage = (tokensOut * SLIPPAGE_BPS) / 10_000n;
  const minOut = tokensOut > slippage ? tokensOut - slippage : tokensOut;

  const newQYes = isYes ? qYes + tokensOut : qYes;
  const newQNo = isYes ? qNo : qNo + tokensOut;

  return {
    tokensOut,
    minOut,
    newQYes,
    newQNo,
  };
}

export { SCALE, USDC_TO_E18 };

