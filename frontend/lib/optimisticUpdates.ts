import { QueryClient } from '@tanstack/react-query';

export interface OptimisticUpdate<T> {
  id: string;
  data: T;
  rollbackData: T;
  timeoutId: NodeJS.Timeout;
  confirmed: boolean;
}

export class OptimisticUpdateManager<T = any> {
  private updates = new Map<string, OptimisticUpdate<T>>();
  private rollbackTimeouts = new Set<NodeJS.Timeout>();

  constructor(private queryClient: QueryClient) {}

  /**
   * Apply an optimistic update with automatic rollback
   */
  applyOptimisticUpdate(
    queryKey: any[],
    updateFn: (currentData: T | undefined) => T,
    rollbackFn: (optimisticData: T) => T,
    options: {
      timeout?: number;
      onRollback?: () => void;
      onConfirm?: () => void;
    } = {}
  ): string {
    const { timeout = 5000, onRollback, onConfirm } = options;

    // Generate unique ID for this update
    const updateId = `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Get current data
    const currentData = this.queryClient.getQueryData<T>(queryKey);

    // Apply optimistic update
    const optimisticData = updateFn(currentData);
    this.queryClient.setQueryData(queryKey, optimisticData);

    // Set up rollback timeout
    const timeoutId = setTimeout(() => {
      this.rollbackUpdate(updateId, queryKey, rollbackFn, onRollback);
    }, timeout);

    // Store the update for potential confirmation/rollback
    this.updates.set(updateId, {
      id: updateId,
      data: optimisticData,
      rollbackData: currentData!,
      timeoutId,
      confirmed: false,
    });

    this.rollbackTimeouts.add(timeoutId);

    return updateId;
  }

  /**
   * Confirm an optimistic update (cancel rollback)
   */
  confirmUpdate(updateId: string): boolean {
    const update = this.updates.get(updateId);
    if (!update || update.confirmed) return false;

    // Cancel rollback timeout
    clearTimeout(update.timeoutId);
    this.rollbackTimeouts.delete(update.timeoutId);

    update.confirmed = true;
    return true;
  }

  /**
   * Manually rollback an update
   */
  rollbackUpdate(
    updateId: string,
    queryKey: any[],
    rollbackFn?: (optimisticData: T) => T,
    onRollback?: () => void
  ): boolean {
    const update = this.updates.get(updateId);
    if (!update) return false;

    // Cancel timeout if still active
    clearTimeout(update.timeoutId);
    this.rollbackTimeouts.delete(update.timeoutId);

    // Apply rollback
    if (rollbackFn) {
      const rolledBackData = rollbackFn(update.data);
      this.queryClient.setQueryData(queryKey, rolledBackData);
    } else {
      // Default rollback to original data
      this.queryClient.setQueryData(queryKey, update.rollbackData);
    }

    // Cleanup
    this.updates.delete(updateId);
    onRollback?.();

    return true;
  }

  /**
   * Get update status
   */
  getUpdateStatus(updateId: string): 'pending' | 'confirmed' | 'rolled_back' | null {
    const update = this.updates.get(updateId);
    if (!update) return null;
    if (update.confirmed) return 'confirmed';
    return 'pending'; // Could be rolled back if timeout fired
  }

  /**
   * Clean up all pending timeouts
   */
  cleanup(): void {
    for (const timeoutId of this.rollbackTimeouts) {
      clearTimeout(timeoutId);
    }
    this.rollbackTimeouts.clear();
    this.updates.clear();
  }
}

// Global instance
let globalOptimisticManager: OptimisticUpdateManager | null = null;

export const getOptimisticManager = (queryClient: QueryClient): OptimisticUpdateManager => {
  if (!globalOptimisticManager) {
    globalOptimisticManager = new OptimisticUpdateManager(queryClient);
  }
  return globalOptimisticManager;
};

// Trade-specific optimistic updates
export interface OptimisticTrade {
  marketId: number;
  user: string;
  side: 'yes' | 'no';
  amount: bigint;
  price: number;
  timestamp: number;
  optimisticId: string;
}

export const applyOptimisticTrade = (
  queryClient: QueryClient,
  marketId: number,
  trade: Omit<OptimisticTrade, 'optimisticId'>
): string => {
  const manager = getOptimisticManager(queryClient);
  const optimisticId = manager.applyOptimisticUpdate(
    ['marketSnapshot', marketId],
    (currentData: any) => {
      if (!currentData) return currentData;

      const optimisticTrade = { ...trade, optimisticId: '', isOptimistic: true };
      optimisticTrade.optimisticId = `opt_${Date.now()}`;

      return {
        ...currentData,
        tradesDesc: [optimisticTrade, ...(currentData.tradesDesc || [])].slice(0, 200),
        // Update price if we have predictive calculation
        optimisticPrice: trade.price,
      };
    },
    (optimisticData: any) => {
      // Remove optimistic trade on rollback
      if (!optimisticData?.tradesDesc) return optimisticData;

      return {
        ...optimisticData,
        tradesDesc: optimisticData.tradesDesc.filter((t: any) => !t.isOptimistic),
        optimisticPrice: undefined,
      };
    },
    {
      timeout: 8000, // 8 seconds for trade confirmation
      onRollback: () => {
        console.warn('[Optimistic] Trade update rolled back', { marketId, trade });
      },
    }
  );

  return optimisticId;
};

export const confirmOptimisticTrade = (
  queryClient: QueryClient,
  marketId: number,
  optimisticId: string
): void => {
  const manager = getOptimisticManager(queryClient);
  const confirmed = manager.confirmUpdate(optimisticId);

  if (confirmed) {
    // Remove optimistic flag from confirmed trade
    queryClient.setQueryData(['marketSnapshot', marketId], (data: any) => {
      if (!data?.tradesDesc) return data;

      return {
        ...data,
        tradesDesc: data.tradesDesc.map((trade: any) => {
          if (trade.optimisticId === optimisticId) {
            const { isOptimistic, optimisticId: _, ...confirmedTrade } = trade;
            return confirmedTrade;
          }
          return trade;
        }),
        optimisticPrice: undefined,
      };
    });
  }
};



