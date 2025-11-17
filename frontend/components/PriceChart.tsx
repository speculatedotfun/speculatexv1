'use client';

import { useEffect, useRef, useCallback, useState, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import type {
  IChartApi,
  ISeriesApi,
  LineData,
  Time,
} from 'lightweight-charts';
import type { PricePoint } from '@/lib/priceHistory/types';

interface PriceChartProps {
  data: PricePoint[];
  selectedSide: 'yes' | 'no';
  height?: number;
  marketId?: number;
  useCentralizedData?: boolean;
}

export const PriceChart = memo(function PriceChart({ data, selectedSide, height = 340, marketId, useCentralizedData = false }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const yesSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const noSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const throttledResizeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moduleRef = useRef<typeof import('lightweight-charts') | null>(null);
  const hasData = Array.isArray(data) && data.length > 0;
  const showLoadingOverlay = !hasData;
  const [chartError, setChartError] = useState<string | null>(null);
  const latestProcessedDataRef = useRef<{ yesData: LineData[]; noData: LineData[] } | null>(null);

  // Process data with visual breaks for gaps
  const processDataWithBreaks = useCallback((rawData: PricePoint[]): { yesData: LineData[], noData: LineData[] } => {
    if (!rawData.length) return { yesData: [], noData: [] };

    // Sort by timestamp, then deduplicate by timestamp (keep last occurrence)
    const sortedData = [...rawData].sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      // If timestamps are equal, sort by txHash to ensure consistent ordering
      return (a.txHash || '').localeCompare(b.txHash || '');
    });
    
    // Deduplicate: keep only the last point for each timestamp
    const dedupedData: PricePoint[] = [];
    const timestampMap = new Map<number, PricePoint>();
    for (const point of sortedData) {
      timestampMap.set(point.timestamp, point);
    }
    // Convert back to array, sorted by timestamp
    dedupedData.push(...Array.from(timestampMap.values()).sort((a, b) => a.timestamp - b.timestamp));
    
    const sortedDataFinal = dedupedData;

    const yesData: LineData[] = [];
    const noData: LineData[] = [];

    // Always add first point
    const firstPoint = sortedDataFinal[0];
    yesData.push({ time: firstPoint.timestamp as Time, value: firstPoint.priceYes });
    noData.push({ time: firstPoint.timestamp as Time, value: firstPoint.priceNo });

    // Process remaining points with gap detection
    for (let i = 1; i < sortedDataFinal.length; i++) {
      const current = sortedDataFinal[i];
      const previous = sortedDataFinal[i - 1];

      // Ensure timestamp is strictly greater than previous (fix any remaining duplicates)
      let currentTimestamp = current.timestamp;
      if (currentTimestamp <= previous.timestamp) {
        currentTimestamp = previous.timestamp + 1;
        console.warn('[PriceChart] Fixed duplicate timestamp:', { 
          original: current.timestamp, 
          fixed: currentTimestamp,
          previous: previous.timestamp 
        });
      }

      // Check for time gaps (> 2 minutes = significant break)
      const timeGap = currentTimestamp - previous.timestamp;
      if (timeGap > 120) { // 2 minutes gap
        // Add break points (undefined creates visual gap)
        const breakTime = previous.timestamp + 30; // 30 seconds after last point
        yesData.push({ time: breakTime as Time, value: undefined as any });
        noData.push({ time: breakTime as Time, value: undefined as any });

        // Add another break point to ensure clear separation
        const breakTime2 = currentTimestamp - 30; // 30 seconds before new point
        yesData.push({ time: breakTime2 as Time, value: undefined as any });
        noData.push({ time: breakTime2 as Time, value: undefined as any });
      }

      // Add current data point with ensured unique timestamp
      yesData.push({ time: currentTimestamp as Time, value: current.priceYes });
      noData.push({ time: currentTimestamp as Time, value: current.priceNo });
    }

    return { yesData, noData };
  }, []);

  // Memoize processed data to prevent expensive recalculations
  const processedData = useMemo(() => {
    return processDataWithBreaks(data);
  }, [data, processDataWithBreaks]);

  // Keep a ref to the latest processed data so setup can populate immediately
  useEffect(() => {
    latestProcessedDataRef.current = processedData;
  }, [processedData]);

  // Setup chart and series (runs once)
  useEffect(() => {
    let disposed = false;

    const setupChart = async () => {
      if (!containerRef.current || disposed) return;

      try {
        setChartError(null);
        // Load lightweight-charts
        if (!moduleRef.current) {
          const mod = await import('lightweight-charts');
          moduleRef.current = ((mod as unknown as { default?: unknown }).default ??
            mod) as typeof import('lightweight-charts');
        }

        const { createChart, ColorType, CrosshairMode, LineStyle, LineSeries, LineType } = moduleRef.current;

        // Create chart with professional styling
        const chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height,
          layout: {
            background: { type: ColorType.Solid, color: '#ffffff' },
            textColor: '#64748b',
            fontSize: 12,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
          },
          grid: {
            vertLines: { color: '#f1f5f9', style: LineStyle.Solid, visible: true },
            horzLines: { color: '#f1f5f9', style: LineStyle.Solid, visible: true },
          },
          crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: {
              width: 1,
              color: '#64748b',
              style: LineStyle.Dashed,
              labelBackgroundColor: '#ffffff'
            },
            horzLine: {
              width: 1,
              color: '#64748b',
              style: LineStyle.Dashed,
              labelBackgroundColor: '#ffffff'
            },
          },
          rightPriceScale: {
            borderColor: '#e2e8f0',
            scaleMargins: { top: 0.1, bottom: 0.1 },
            borderVisible: true,
            entireTextOnly: true,
            ticksVisible: true,
          },
          timeScale: {
            borderColor: '#e2e8f0',
            timeVisible: true,
            secondsVisible: false,
            borderVisible: true,
            fixLeftEdge: true,
            fixRightEdge: true,
          },
          localization: {
            priceFormatter: (price: number) => `${(price * 100).toFixed(2)}¢`,
            timeFormatter: (timestamp: number) => {
              return new Date(timestamp * 1000).toLocaleString();
            },
          },
          watermark: {
            visible: true,
            fontSize: 48,
            horzAlign: 'center',
            vertAlign: 'center',
            color: 'rgba(100, 116, 139, 0.05)',
            text: 'SPECULATE',
          },
          handleScroll: { mouseWheel: true, pressedMouseMove: true },
          handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        });

        // Create professional line series with enhanced styling
        const yesLineWidth = selectedSide === 'yes' ? 4 : 3;
        const noLineWidth = selectedSide === 'no' ? 4 : 3;

        const yesSeries = chart.addSeries(LineSeries, {
          lineWidth: yesLineWidth,
          lineType: LineType.Curved,
          pointMarkersVisible: true,
          pointMarkersRadius: selectedSide === 'yes' ? 4 : 3,
          pointMarkersBorderColor: '#ffffff',
          pointMarkersColor: '#22c55e',
          priceLineVisible: true,
          priceLineWidth: yesLineWidth,
          priceLineColor: '#22c55e',
          lastValueVisible: true,
          crosshairMarkerVisible: true,
          crosshairMarkerBorderColor: '#ffffff',
          crosshairMarkerBackgroundColor: '#22c55e',
          crosshairMarkerRadius: 6,
          color: '#22c55e',
        } as any);

        const noSeries = chart.addSeries(LineSeries, {
          lineWidth: noLineWidth,
          lineType: LineType.Curved,
          pointMarkersVisible: true,
          pointMarkersRadius: selectedSide === 'no' ? 4 : 3,
          pointMarkersBorderColor: '#ffffff',
          pointMarkersColor: '#ef4444',
          priceLineVisible: true,
          priceLineWidth: noLineWidth,
          priceLineColor: '#ef4444',
          lastValueVisible: true,
          crosshairMarkerVisible: true,
          crosshairMarkerBorderColor: '#ffffff',
          crosshairMarkerBackgroundColor: '#ef4444',
          crosshairMarkerRadius: 6,
          color: '#ef4444',
        } as any);

        // Store references
        chartRef.current = chart;
        yesSeriesRef.current = yesSeries;
        noSeriesRef.current = noSeries;

        // Ensure non-zero width even if parent layout isn't ready at mount
        const fixWidth = () => {
          const el = containerRef.current;
          const ch = chartRef.current;
          if (!el || !ch) return;
          const measured =
            el.clientWidth ||
            el.getBoundingClientRect().width ||
            el.parentElement?.clientWidth ||
            600; // fallback
          if (measured > 0) {
            ch.applyOptions({ width: Math.floor(measured) });
          }
        };
        // keep a stable reference for cleanup
        (window as any).__priceChartFixWidth = fixWidth;

        // Run a few times around the next frames to catch late layout
        requestAnimationFrame(fixWidth);
        setTimeout(fixWidth, 0);
        setTimeout(fixWidth, 150);
        // Also listen to window resize as a fallback
        window.addEventListener('resize', (window as any).__priceChartFixWidth);

        // If we already have data, populate the series immediately (avoids blank until next tick)
        try {
          const latest = latestProcessedDataRef.current;
          if (latest && yesSeriesRef.current && noSeriesRef.current) {
            yesSeriesRef.current.setData(latest.yesData);
            noSeriesRef.current.setData(latest.noData);
            setTimeout(() => {
              chartRef.current?.timeScale().fitContent();
            }, 50);
          }
        } catch (err) {
          console.warn('[PriceChart] Failed to set initial data after setup', err);
        }

        // Setup resize observer with throttling
        const observer = new ResizeObserver(entries => {
          if (throttledResizeRef.current) return;

          throttledResizeRef.current = setTimeout(() => {
            if (entries[0]?.target === containerRef.current && chartRef.current) {
              const newWidth = entries[0].contentRect.width;
              chartRef.current.applyOptions({ width: newWidth });
            }
            throttledResizeRef.current = null;
          }, 100);
        });
        observer.observe(containerRef.current);
        resizeObserverRef.current = observer;

      } catch (error) {
        console.error('[PriceChart] Failed to setup chart:', error);
        if (!disposed) {
          setChartError('Failed to initialize chart');
        }
      }
    };

    void setupChart();

    return () => {
      disposed = true;
      if (throttledResizeRef.current) {
        clearTimeout(throttledResizeRef.current);
        throttledResizeRef.current = null;
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      // Remove window resize listener
      try {
        const fw = (window as any).__priceChartFixWidth;
        if (fw) window.removeEventListener('resize', fw);
      } catch {
        // ignore
      }
      chartRef.current?.remove();
      chartRef.current = null;
      yesSeriesRef.current = null;
      noSeriesRef.current = null;
    };
  }, []); // Empty dependency array - setup runs once

  // Update chart height when prop changes
  useEffect(() => {
    if (chartRef.current && height > 0) {
      chartRef.current.applyOptions({ height });
    }
  }, [height]);

  const updateChartData = useCallback((chartData: PricePoint[]) => {
    if (!yesSeriesRef.current || !noSeriesRef.current) return;

    const { yesData, noData } = processedData;

    // Log removed for production

    // Update data with smooth transition
    const transitionDuration = 300;

    yesSeriesRef.current.setData(yesData);
    noSeriesRef.current.setData(noData);

    // Smooth fit content after a brief delay to allow visual updates
    setTimeout(() => {
      chartRef.current?.timeScale().fitContent();
    }, transitionDuration);
  }, [processedData, selectedSide]);

  // Update chart data with visual breaks
  const updateSeriesStyling = useCallback(() => {
    if (!yesSeriesRef.current || !noSeriesRef.current) return;

    const yesLineWidth = selectedSide === 'yes' ? 4 : 3;
    const noLineWidth = selectedSide === 'no' ? 4 : 3;

    try {
      const lineType = moduleRef.current?.LineType?.Curved;

      const yesOptions: any = {
        lineWidth: yesLineWidth,
        priceLineWidth: yesLineWidth,
        priceLineColor: '#22c55e',
        color: '#22c55e',
        pointMarkersVisible: true,
        pointMarkersRadius: selectedSide === 'yes' ? 4 : 3,
        pointMarkersBorderColor: '#ffffff',
        pointMarkersColor: '#22c55e',
      };

      const noOptions: any = {
        lineWidth: noLineWidth,
        priceLineWidth: noLineWidth,
        priceLineColor: '#ef4444',
        color: '#ef4444',
        pointMarkersVisible: true,
        pointMarkersRadius: selectedSide === 'no' ? 4 : 3,
        pointMarkersBorderColor: '#ffffff',
        pointMarkersColor: '#ef4444',
      };

      if (lineType !== undefined) {
        yesOptions.lineType = lineType;
        noOptions.lineType = lineType;
      }

      yesSeriesRef.current.applyOptions({
        ...yesOptions,
      });

      noSeriesRef.current.applyOptions({
        ...noOptions,
      });

      console.log('[PriceChart] Applied styling for selectedSide:', selectedSide);
    } catch (error) {
      console.warn('[PriceChart] Failed to apply styling:', error);
    }
  }, [selectedSide]);

  // Update data when data prop changes
  useEffect(() => {
    if (data.length > 0) {
      // Ensure chart width is correct in case it mounted at 0
      const el = containerRef.current;
      const ch = chartRef.current;
      if (el && ch) {
        const measured =
          el.clientWidth ||
          el.getBoundingClientRect().width ||
          el.parentElement?.clientWidth ||
          600;
        if (measured > 0) {
          ch.applyOptions({ width: Math.floor(measured) });
        }
      }
      updateChartData(data);
    }
  }, [data, updateChartData]);

  // Update styling when selectedSide changes (separate from data updates)
  useEffect(() => {
    updateSeriesStyling();
  }, [selectedSide, updateSeriesStyling]);

  // Error fallback UI
  if (chartError) {
    return (
      <div className="relative w-full rounded-lg overflow-hidden border border-gray-200 bg-white shadow-sm" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Chart Error</h3>
            <p className="text-gray-600 mb-4">{chartError}</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center px-4 py-2 bg-[#14B8A6] text-white rounded-lg hover:bg-[#14B8A6]/90 transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-gray-200 bg-white shadow-sm" style={{ height }} data-testid="price-chart">
      <div ref={containerRef} className="w-full h-full" />
      {showLoadingOverlay && (
        <div className="absolute top-4 right-4 z-10">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-6 h-6 border-2 border-[#14B8A6] border-t-transparent rounded-full"
          />
        </div>
      )}
    </div>
  );
});

