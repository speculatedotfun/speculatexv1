import { renderHook, act, waitFor } from '@testing-library/react'
import { useMarketData } from '@/lib/hooks/useMarketData'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { bscTestnet } from 'wagmi/chains'

// Mock wagmi hooks
jest.mock('wagmi', () => ({
  useAccount: jest.fn(() => ({
    address: '0x1234567890123456789012345678901234567890',
    isConnected: true,
  })),
  useReadContract: jest.fn(() => ({
    data: {
      qYes: 1000000000n,
      qNo: 1000000000n,
      vault: 5000000n,
      b: 1000000000000000000000000n,
      priceYes: 500000n, // 0.5 * 1e6
    },
    isLoading: false,
    refetch: jest.fn(),
  })),
  useWriteContract: jest.fn(() => ({
    writeContract: jest.fn(),
    isPending: false,
  })),
  useBlockNumber: jest.fn(() => ({
    data: 1000000n,
    isLoading: false,
  })),
  usePublicClient: jest.fn(() => ({
    readContract: jest.fn(),
    waitForTransactionReceipt: jest.fn(),
  })),
}))

const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  const config = createConfig({
    chains: [bscTestnet],
    transports: {
      [bscTestnet.id]: http(),
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}

describe('useMarketData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useMarketData(1), {
      wrapper: createTestWrapper(),
    })

    expect(result.current.currentPrices).toEqual({ yes: 0.5, no: 0.5 })
    expect(result.current.instantPrices).toEqual({ yes: 0.5, no: 0.5 })
    expect(result.current.chartData).toEqual([])
    expect(result.current.marketState).toBeNull()
    expect(result.current.isLoading).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('should load market state data', async () => {
    const { result } = renderHook(() => useMarketData(1), {
      wrapper: createTestWrapper(),
    })

    // Wait for initial data loading
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.marketState).toEqual({
      qYes: 1000000000n,
      qNo: 1000000000n,
      vault: 5000000n,
      b: 1000000000000000000000000n,
      priceYes: 500000n,
    })

    expect(result.current.currentPrices).toEqual({ yes: 0.5, no: 0.5 })
    expect(result.current.instantPrices).toEqual({ yes: 0.5, no: 0.5 })
  })

  it('should handle invalid market IDs', () => {
    const { result } = renderHook(() => useMarketData(0), {
      wrapper: createTestWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
    // Should not attempt to load data for invalid market ID
  })

  it('should provide refetch function', async () => {
    const { result } = renderHook(() => useMarketData(1), {
      wrapper: createTestWrapper(),
    })

    expect(typeof result.current.refetch).toBe('function')

    // Call refetch
    await act(async () => {
      await result.current.refetch()
    })

    // Should still have data after refetch
    expect(result.current.marketState).toBeTruthy()
  })

  it('should handle contract read errors gracefully', async () => {
    // Mock a failed contract read
    const mockUseReadContract = jest.fn(() => ({
      data: undefined,
      isLoading: false,
      error: new Error('Contract read failed'),
      refetch: jest.fn(),
    }))

    jest.doMock('wagmi', () => ({
      ...jest.requireActual('wagmi'),
      useReadContract: mockUseReadContract,
    }))

    const { result } = renderHook(() => useMarketData(1), {
      wrapper: createTestWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.marketState).toBeNull()
    expect(result.current.error).toBe('Failed to load market data')
  })
})
