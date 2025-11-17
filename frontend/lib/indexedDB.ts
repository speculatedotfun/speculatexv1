// IndexedDB utilities for enterprise-level caching
// Provides persistent storage for markets data, price history, and other app data

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  version: string;
  ttl?: number; // Time to live in milliseconds
}

interface CacheOptions {
  ttl?: number; // Default 24 hours
  version?: string;
}

class IndexedDBCache {
  private dbPromise: Promise<IDBDatabase>;
  private readonly dbName = 'SpeculateCache';
  private readonly dbVersion = 1;

  constructor() {
    this.dbPromise = this.openDB();
  }

  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Markets store
        if (!db.objectStoreNames.contains('markets')) {
          const marketsStore = db.createObjectStore('markets', { keyPath: 'id' });
          marketsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Market details store
        if (!db.objectStoreNames.contains('marketDetails')) {
          const detailsStore = db.createObjectStore('marketDetails', { keyPath: 'marketId' });
          detailsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Price history store
        if (!db.objectStoreNames.contains('priceHistory')) {
          const priceStore = db.createObjectStore('priceHistory', { keyPath: 'marketId' });
          priceStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // User preferences store
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'key' });
        }
      };
    });
  }

  // Generic cache operations
  async set<T>(storeName: string, key: string, data: T, options: CacheOptions = {}): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      version: options.version || '1.0',
      ttl: options.ttl || 24 * 60 * 60 * 1000, // 24 hours default
    };

    return new Promise((resolve, reject) => {
      const request = store.put(entry, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get<T>(storeName: string, key: string): Promise<CacheEntry<T> | null> {
    const db = await this.dbPromise;
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const entry = request.result;
        if (!entry) {
          resolve(null);
          return;
        }

        // Check if entry is expired
        const age = Date.now() - entry.timestamp;
        if (entry.ttl && age > entry.ttl) {
          // Auto-clean expired entries
          this.delete(storeName, key).catch(console.warn);
          resolve(null);
          return;
        }

        resolve(entry);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName: string): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Specific cache operations for markets
  async saveMarketsCache(markets: any[], options: CacheOptions = {}): Promise<void> {
    await this.set('markets', 'latest', markets, {
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      ...options,
    });
  }

  async getMarketsCache(): Promise<any[] | null> {
    const entry = await this.get<any[]>('markets', 'latest');
    return entry ? entry.data : null;
  }

  async saveMarketDetails(marketId: number, details: any, options: CacheOptions = {}): Promise<void> {
    await this.set('marketDetails', marketId.toString(), details, {
      ttl: 60 * 60 * 1000, // 1 hour for details
      ...options,
    });
  }

  async getMarketDetails(marketId: number): Promise<any | null> {
    const entry = await this.get<any>('marketDetails', marketId.toString());
    return entry ? entry.data : null;
  }

  async savePriceHistory(marketId: number, history: any[], options: CacheOptions = {}): Promise<void> {
    await this.set('priceHistory', marketId.toString(), history, {
      ttl: 6 * 60 * 60 * 1000, // 6 hours for price history
      ...options,
    });
  }

  async getPriceHistory(marketId: number): Promise<any[] | null> {
    const entry = await this.get<any[]>('priceHistory', marketId.toString());
    return entry ? entry.data : null;
  }

  // Utility methods
  async isCacheFresh(storeName: string, key: string, maxAge: number = 60 * 60 * 1000): Promise<boolean> {
    const entry = await this.get(storeName, key);
    if (!entry) return false;

    const age = Date.now() - entry.timestamp;
    return age < maxAge;
  }

  async cleanupExpired(): Promise<void> {
    const db = await this.dbPromise;
    const storeNames = ['markets', 'marketDetails', 'priceHistory'];

    for (const storeName of storeNames) {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const index = store.index('timestamp');

      const request = index.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const entry = cursor.value;
          const age = Date.now() - entry.timestamp;

          if (entry.ttl && age > entry.ttl) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
    }
  }

  // Get cache statistics
  async getStats(): Promise<{
    markets: { count: number; size: number };
    marketDetails: { count: number; size: number };
    priceHistory: { count: number; size: number };
  }> {
    const db = await this.dbPromise;

    const getStoreStats = (storeName: string): Promise<{ count: number; size: number }> => {
      return new Promise((resolve) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const countRequest = store.count();
        let size = 0;

        countRequest.onsuccess = () => {
          const count = countRequest.result;

          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result;
            if (cursor) {
              // Rough size estimation
              size += JSON.stringify(cursor.value).length;
              cursor.continue();
            } else {
              resolve({ count, size });
            }
          };
        };
      });
    };

    const [markets, marketDetails, priceHistory] = await Promise.all([
      getStoreStats('markets'),
      getStoreStats('marketDetails'),
      getStoreStats('priceHistory'),
    ]);

    return { markets, marketDetails, priceHistory };
  }
}

// Singleton instance
let cacheInstance: IndexedDBCache | null = null;

export const getIndexedDBCache = (): IndexedDBCache => {
  if (!cacheInstance) {
    cacheInstance = new IndexedDBCache();
  }
  return cacheInstance;
};

// React hook for using IndexedDB cache
export const useIndexedDBCache = () => {
  return getIndexedDBCache();
};

// Utility functions for common operations
export const saveMarketsToCache = async (markets: any[]) => {
  const cache = getIndexedDBCache();
  await cache.saveMarketsCache(markets);
};

export const loadMarketsFromCache = async (): Promise<any[] | null> => {
  const cache = getIndexedDBCache();
  return await cache.getMarketsCache();
};

export const isMarketsCacheFresh = async (maxAge: number = 60 * 60 * 1000): Promise<boolean> => {
  const cache = getIndexedDBCache();
  return await cache.isCacheFresh('markets', 'latest', maxAge);
};

export default IndexedDBCache;



