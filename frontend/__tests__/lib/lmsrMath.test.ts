import { calculatePrice, calculateShares } from '@/lib/lmsrMath'

// Mock BigInt serialization for tests
Object.defineProperty(BigInt.prototype, 'toJSON', {
  value: function() { return this.toString() + 'n' }
})

describe('LMSR Math Functions', () => {
  describe('calculatePrice', () => {
    it('should calculate price for equal shares', () => {
      const qYes = 1000000000n // 1000 shares
      const qNo = 1000000000n  // 1000 shares
      const b = 1000000000000000000000000n // 1e24

      const price = calculatePrice(qYes, qNo, b)

      // With equal shares, price should be close to 0.5
      expect(Number(price) / 1e18).toBeCloseTo(0.5, 2)
    })

    it('should calculate higher price when more YES shares', () => {
      const qYes = 2000000000n // 2000 shares
      const qNo = 1000000000n  // 1000 shares
      const b = 1000000000000000000000000n

      const price = calculatePrice(qYes, qNo, b)

      // Price should be higher than 0.5
      expect(Number(price) / 1e18).toBeGreaterThan(0.5)
    })

    it('should calculate lower price when more NO shares', () => {
      const qYes = 500000000n  // 500 shares
      const qNo = 1500000000n  // 1500 shares
      const b = 1000000000000000000000000n

      const price = calculatePrice(qYes, qNo, b)

      // Price should be lower than 0.5
      expect(Number(price) / 1e18).toBeLessThan(0.5)
    })

    it('should handle edge cases', () => {
      // Very small numbers
      const price1 = calculatePrice(1n, 1n, 1000000n)
      expect(Number(price1)).toBeGreaterThan(0)

      // Large numbers
      const price2 = calculatePrice(1000000000000n, 1000000000000n, 1000000000000000000000000n)
      expect(Number(price2) / 1e18).toBeCloseTo(0.5, 1)
    })

    it('should return valid BigInt', () => {
      const qYes = 1000000000n
      const qNo = 1000000000n
      const b = 1000000000000000000000000n

      const price = calculatePrice(qYes, qNo, b)

      expect(typeof price).toBe('bigint')
      expect(price).toBeGreaterThan(0n)
    })
  })

  describe('calculateShares', () => {
    it('should calculate shares for given amount', () => {
      const amount = 1000000000000000000n // 1 ETH in wei
      const price = 500000000000000000n // 0.5 ETH
      const b = 1000000000000000000000000n

      const shares = calculateShares(amount, price, b)

      expect(typeof shares).toBe('bigint')
      expect(shares).toBeGreaterThan(0n)
    })

    it('should return more shares for cheaper prices', () => {
      const amount = 1000000000000000000n // 1 ETH
      const b = 1000000000000000000000000n

      const sharesCheap = calculateShares(amount, 300000000000000000n, b) // 0.3
      const sharesExpensive = calculateShares(amount, 700000000000000000n, b) // 0.7

      expect(sharesCheap).toBeGreaterThan(sharesExpensive)
    })

    it('should handle zero amount', () => {
      const shares = calculateShares(0n, 500000000000000000n, 1000000000000000000000000n)
      expect(shares).toBe(0n)
    })

    it('should handle edge case prices', () => {
      const amount = 1000000000000000000n
      const b = 1000000000000000000000000n

      // Very low price
      const sharesLow = calculateShares(amount, 100000000000000n, b)
      expect(sharesLow).toBeGreaterThan(0n)

      // Very high price (close to 1)
      const sharesHigh = calculateShares(amount, 900000000000000000n, b)
      expect(sharesHigh).toBeGreaterThan(0n)
      expect(sharesHigh).toBeLessThan(sharesLow)
    })
  })

  describe('Integration tests', () => {
    it('should maintain price consistency', () => {
      const qYes = 1200000000n // 1200 shares
      const qNo = 800000000n  // 800 shares
      const b = 1000000000000000000000000n

      const price = calculatePrice(qYes, qNo, b)
      const priceValue = Number(price) / 1e18

      // Price should reflect the imbalance (more YES shares = higher price)
      expect(priceValue).toBeGreaterThan(0.5)
      expect(priceValue).toBeLessThan(1.0)
    })

    it('should handle realistic trading scenario', () => {
      // Start with equal shares
      let qYes = 1000000000n
      let qNo = 1000000000n
      const b = 1000000000000000000000000n

      // Someone buys YES shares
      const buyAmount = 100000000000000000n // 0.1 ETH
      const currentPrice = calculatePrice(qYes, qNo, b)
      const sharesBought = calculateShares(buyAmount, currentPrice, b)

      qYes += sharesBought

      // New price should be higher
      const newPrice = calculatePrice(qYes, qNo, b)
      expect(Number(newPrice)).toBeGreaterThan(Number(currentPrice))
    })
  })
})
