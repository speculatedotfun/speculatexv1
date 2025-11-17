import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { bscTestnet } from 'wagmi/chains';

// Override the BSC Testnet RPC URLs to prevent fallback to placeholder URLs
const bscTestnetOverride = {
  ...bscTestnet,
  rpcUrls: {
    ...bscTestnet.rpcUrls,
    default: {
      http: ['https://bsc-testnet.publicnode.com'],
    },
    public: {
      http: ['https://bsc-testnet.publicnode.com'],
    },
  },
};

function sanitizeRpcUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed === '' || trimmed.startsWith('/YOUR_CHAINSTACK_HTTP')) {
    return '';
  }
  return trimmed;
}

const envRpcUrl = sanitizeRpcUrl(process.env.NEXT_PUBLIC_RPC_URL);

const httpUrl = envRpcUrl || 'https://bsc-testnet.publicnode.com';

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id-for-development';

export const config = getDefaultConfig({
  appName: 'SpeculateX v3',
  projectId: walletConnectProjectId,
  chains: [bscTestnetOverride],
  ssr: true,
  transports: {
    [bscTestnetOverride.id]: http(httpUrl),
  },
});
