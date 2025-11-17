import { QueryClient } from '@tanstack/react-query';

export interface BatchConfig {
  maxBatchSize: number;
  maxBatchAge: number; // milliseconds
  maxQueueSize: number;
}

export interface BatchItem<T = any> {
  id: string;
  data: T;
  timestamp: number;
  priority?: number; // higher = more important
}

export interface BatchResult<T = any> {
  items: BatchItem<T>[];
  processedAt: number;
  batchId: string;
}

/**
 * Intelligent batch processor for high-frequency updates
 */
export class UpdateBatchProcessor<T = any> {
  private queue: BatchItem<T>[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private processingBatch = false;

  constructor(
    private config: BatchConfig,
    private processBatch: (batch: BatchResult<T>) => Promise<void> | void,
    private options: {
      prioritySort?: (a: BatchItem<T>, b: BatchItem<T>) => number;
      duplicateKeyFn?: (item: BatchItem<T>) => string;
    } = {}
  ) {
    this.options = {
      prioritySort: (a, b) => (b.priority || 0) - (a.priority || 0),
      ...options,
    };
  }

  /**
   * Add an item to the processing queue
   */
  add(item: Omit<BatchItem<T>, 'id' | 'timestamp'>): void {
    // Create the full batch item first
    const batchItem: BatchItem<T> = {
      ...item,
      id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    // Check queue size limit
    if (this.queue.length >= this.config.maxQueueSize) {
      console.warn('[BatchProcessor] Queue full, dropping oldest item');
      this.queue.shift(); // Remove oldest item
    }

    // Check for duplicates if duplicate key function provided
    if (this.options.duplicateKeyFn) {
      const key = this.options.duplicateKeyFn(batchItem);
      const existingIndex = this.queue.findIndex(
        existing => this.options.duplicateKeyFn!(existing) === key
      );

      if (existingIndex >= 0) {
        // Replace existing item with new one
        this.queue[existingIndex] = batchItem;
        return;
      }
    }

    // Add new item
    this.queue.push(batchItem);

    // Sort by priority if provided
    if (this.options.prioritySort) {
      this.queue.sort(this.options.prioritySort);
    }

    this.scheduleProcessing();
  }

  /**
   * Add multiple items at once
   */
  addBatch(items: Omit<BatchItem<T>, 'id' | 'timestamp'>[]): void {
    for (const item of items) {
      this.add(item);
    }
  }

  /**
   * Force immediate processing of current queue
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0 || this.processingBatch) return;

    await this.processCurrentBatch();
  }

  /**
   * Get current queue status
   */
  getStatus() {
    return {
      queueSize: this.queue.length,
      isProcessing: this.processingBatch,
      oldestItemAge: this.queue.length > 0
        ? Date.now() - this.queue[0].timestamp
        : 0,
      newestItemAge: this.queue.length > 0
        ? Date.now() - this.queue[this.queue.length - 1].timestamp
        : 0,
    };
  }

  /**
   * Clear the queue without processing
   */
  clear(): void {
    this.queue = [];
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }

  private scheduleProcessing(): void {
    if (this.batchTimeout) return; // Already scheduled

    // Schedule processing based on batch size or age
    const shouldProcessImmediately =
      this.queue.length >= this.config.maxBatchSize;

    const delay = shouldProcessImmediately ? 0 : this.config.maxBatchAge;

    this.batchTimeout = setTimeout(() => {
      this.processCurrentBatch();
    }, delay);
  }

  private async processCurrentBatch(): Promise<void> {
    if (this.queue.length === 0 || this.processingBatch) return;

    this.processingBatch = true;
    const batchItems = [...this.queue];
    this.queue = [];

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    try {
      const batchResult: BatchResult<T> = {
        items: batchItems,
        processedAt: Date.now(),
        batchId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };

      await this.processBatch(batchResult);
    } catch (error) {
      console.error('[BatchProcessor] Batch processing failed:', error);

      // Re-queue failed items with backoff
      const backoffDelay = Math.min(1000 * Math.pow(2, batchItems.length > 0 ? 1 : 0), 30000);
      setTimeout(() => {
        this.queue.unshift(...batchItems);
        this.scheduleProcessing();
      }, backoffDelay);
    } finally {
      this.processingBatch = false;

      // Schedule next batch if queue has items
      if (this.queue.length > 0) {
        this.scheduleProcessing();
      }
    }
  }
}

/**
 * Trade-specific batch processor
 */
export interface TradeBatchItemData {
  marketId: number;
  trade: any; // Webhook trade data
  priority: number; // Based on market activity
}

export const createTradeBatchProcessor = (
  queryClient: QueryClient,
  applyDeltas: (queryClient: QueryClient, deltas: any[]) => void
): UpdateBatchProcessor<TradeBatchItemData> => {

  const processTradeBatch = async (batch: BatchResult<TradeBatchItemData>) => {
    console.log(`[TradeBatch] Processing batch of ${batch.items.length} trades`);

    // Group trades by market
    const marketGroups = new Map<number, BatchItem<TradeBatchItemData>[]>();

    for (const item of batch.items) {
      if (!marketGroups.has(item.data.marketId)) {
        marketGroups.set(item.data.marketId, []);
      }
      marketGroups.get(item.data.marketId)!.push(item);
    }

    // Process each market group
    for (const [marketId, trades] of marketGroups) {
      try {
        // Convert trades to deltas
        const deltas = trades.map(item => ({
          marketId,
          trades: [item.data.trade],
          timestamp: item.timestamp,
        }));

        // Apply all deltas for this market at once
        applyDeltas(queryClient, deltas);

        console.log(`[TradeBatch] Applied ${trades.length} trades for market ${marketId}`);
      } catch (error) {
        console.error(`[TradeBatch] Failed to process market ${marketId}:`, error);
      }
    }
  };

  const getTradePriority = (trade: any): number => {
    // Higher priority for:
    // - Larger trades
    // - More active markets
    // - Recent trades

    const usdcAmount = Math.abs(parseFloat(trade.usdcDelta || '0'));
    const recency = (Date.now() - (trade.timestamp || 0)) / 1000; // seconds ago

    // Priority formula: size bonus + recency bonus
    return Math.log10(usdcAmount + 1) - (recency / 3600); // Favor large recent trades
  };

  return new UpdateBatchProcessor<TradeBatchItemData>(
    {
      maxBatchSize: 50, // Process up to 50 trades at once
      maxBatchAge: 500, // Or every 500ms
      maxQueueSize: 1000, // Max 1000 trades in queue
    },
    processTradeBatch,
    {
      prioritySort: (a, b) => getTradePriority(a.data.trade) - getTradePriority(b.data.trade),
      duplicateKeyFn: (item) => `${item.data.marketId}_${item.data.trade.txHash || item.data.trade.id}`,
    }
  );
};

/**
 * Global trade batch processor instance
 */
let globalTradeBatchProcessor: UpdateBatchProcessor<TradeBatchItemData> | null = null;

export const getTradeBatchProcessor = (queryClient: QueryClient): UpdateBatchProcessor<TradeBatchItemData> => {
  if (!globalTradeBatchProcessor) {
    globalTradeBatchProcessor = createTradeBatchProcessor(
      queryClient,
      (qc, deltas) => {
        // Import the differential updates function
        import('./differentialUpdates').then(({ applyBatchDeltas }) => {
          applyBatchDeltas(qc, deltas);
        });
      }
    );
  }
  return globalTradeBatchProcessor;
};
