'use client';

import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '@/lib/wagmi';
import { ToastHost } from '@/components/ui/toast';

// Dynamic import to avoid chunking issues
import dynamic from 'next/dynamic';

const RainbowKitProvider = dynamic(
  () => import('@rainbow-me/rainbowkit').then((mod) => mod.RainbowKitProvider),
  {
    ssr: false,
    loading: () => null,
  }
);

// Import styles
import '@rainbow-me/rainbowkit/styles.css';

// Singleton QueryClient to prevent multiple instances
let globalQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
        },
      },
    });
  } else {
    // Browser: make a new query client if we don't already have one
    if (!globalQueryClient) {
      globalQueryClient = new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      });
    }
    return globalQueryClient;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <ToastHost>{children}</ToastHost>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}


