import { render, screen } from '@testing-library/react'
import { PriceChart } from '@/components/PriceChart'
import type { PricePoint } from '@/lib/priceHistory/types'

// Mock lightweight-charts
jest.mock('lightweight-charts', () => ({
  createChart: jest.fn(() => ({
    timeScale: jest.fn(() => ({
      fitContent: jest.fn(),
      applyOptions: jest.fn(),
    })),
    addLineSeries: jest.fn(() => ({
      setData: jest.fn(),
      applyOptions: jest.fn(),
    })),
    applyOptions: jest.fn(),
    remove: jest.fn(),
  })),
  ColorType: {
    Solid: 'solid',
  },
  LineStyle: {
    Solid: 0,
  },
  TickMarkType: {
    Year: 0,
    Month: 1,
    Day: 2,
    Hour: 3,
    Minute: 4,
    Second: 5,
  },
}))

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

const mockData: PricePoint[] = [
  {
    timestamp: 1609459200, // 2021-01-01
    priceYes: 0.6,
    priceNo: 0.4,
    txHash: '0x123',
  },
  {
    timestamp: 1609545600, // 2021-01-02
    priceYes: 0.7,
    priceNo: 0.3,
    txHash: '0x456',
  },
]

describe('PriceChart', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render loading overlay when no data', () => {
    render(
      <PriceChart
        data={[]}
        selectedSide="yes"
        marketId={1}
      />
    )

    expect(screen.getByText(/updating chart/i)).toBeInTheDocument()
  })

  it('should render chart with data', () => {
    render(
      <PriceChart
        data={mockData}
        selectedSide="yes"
        marketId={1}
      />
    )

    // Chart container should be rendered
    const chartContainer = document.querySelector('[data-testid="price-chart"]') ||
                          document.querySelector('.price-chart-container')
    expect(chartContainer).toBeInTheDocument()
  })

  it('should handle different selected sides', () => {
    const { rerender } = render(
      <PriceChart
        data={mockData}
        selectedSide="yes"
        marketId={1}
      />
    )

    // Re-render with different side
    rerender(
      <PriceChart
        data={mockData}
        selectedSide="no"
        marketId={1}
      />
    )

    // Should still render without errors
    expect(document.querySelector('.price-chart-container')).toBeInTheDocument()
  })

  it('should handle useCentralizedData prop', () => {
    render(
      <PriceChart
        data={mockData}
        selectedSide="yes"
        marketId={1}
        useCentralizedData={true}
      />
    )

    // Should render normally with the prop
    expect(document.querySelector('.price-chart-container')).toBeInTheDocument()
  })

  it('should handle empty data array', () => {
    render(
      <PriceChart
        data={[]}
        selectedSide="yes"
        marketId={1}
      />
    )

    // Should show loading state
    expect(screen.getByText(/updating chart/i)).toBeInTheDocument()
  })

  it('should handle null data', () => {
    render(
      <PriceChart
        data={null as any}
        selectedSide="yes"
        marketId={1}
      />
    )

    // Should handle gracefully (component should not crash)
    expect(document.querySelector('.price-chart-container')).toBeInTheDocument()
  })

  it('should apply different heights', () => {
    render(
      <PriceChart
        data={mockData}
        selectedSide="yes"
        marketId={1}
        height={500}
      />
    )

    // Container should exist (height is applied via CSS)
    expect(document.querySelector('.price-chart-container')).toBeInTheDocument()
  })

  it('should handle chart errors gracefully', () => {
    // Mock chart creation to throw error
    const mockCreateChart = jest.fn(() => {
      throw new Error('Chart creation failed')
    })

    jest.doMock('lightweight-charts', () => ({
      ...jest.requireActual('lightweight-charts'),
      createChart: mockCreateChart,
    }))

    render(
      <PriceChart
        data={mockData}
        selectedSide="yes"
        marketId={1}
      />
    )

    // Should render error state or handle gracefully
    expect(document.querySelector('.price-chart-container')).toBeInTheDocument()
  })
})
