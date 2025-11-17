// @ts-ignore - dependency installed in frontend workspace; typing resolved post-install
import { createClient, type SubscribePayload } from 'graphql-ws';

const SUBGRAPH_HTTP_URL =
  process.env.NEXT_PUBLIC_GOLDSKY_HTTP_URL ?? process.env.NEXT_PUBLIC_SUBGRAPH_URL ?? 'https://api.goldsky.com/api/public/project_cmhtmu9wctrs301vt0wz1190b/subgraphs/speculate-core-v2/production/gn';
const SUBGRAPH_WS_URL =
  process.env.NEXT_PUBLIC_GOLDSKY_WS_URL ?? process.env.NEXT_PUBLIC_SUBGRAPH_WS_URL ?? null;

interface GraphQLError {
  message: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

interface SubscriptionResult<T> {
  data?: T;
  errors?: GraphQLError[];
}

export async function fetchSubgraph<T>(
  query: string,
  variables: Record<string, unknown> = {},
  init?: RequestInit,
): Promise<T> {
  if (!SUBGRAPH_HTTP_URL) {
    throw new Error('Missing Goldsky subgraph HTTP URL. Set NEXT_PUBLIC_GOLDSKY_HTTP_URL (or legacy NEXT_PUBLIC_SUBGRAPH_URL).');
  }

  let attempt = 0;
  const maxAttempts = 3;
  const baseDelay = 1_000;

  while (true) {
    try {
      const response = await fetch(SUBGRAPH_HTTP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        ...init,
      });

      if (!response.ok) {
        const text = await response.text();
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const suffix = retryAfter ? ` (retry after ${retryAfter}s)` : '';
          throw new Error(`Subgraph request failed with 429${suffix}`);
        }
        if (attempt < maxAttempts - 1) {
          const delay = baseDelay * 2 ** attempt + Math.random() * 500;
          await new Promise(resolve => setTimeout(resolve, delay));
          attempt += 1;
          continue;
        }
        throw new Error(`Subgraph request failed: ${response.status} ${text}`);
      }

      const json = (await response.json()) as GraphQLResponse<T>;
      if (json.errors && json.errors.length > 0) {
        const error = json.errors.map(err => err.message).join('; ');
        throw new Error(`Subgraph responded with errors: ${error}`);
      }

      if (!json.data) {
        throw new Error('Subgraph response missing data');
      }

      return json.data;
    } catch (error) {
      if (attempt >= maxAttempts - 1 || !(error instanceof Error)) {
        throw error;
      }
      const delay = baseDelay * 2 ** attempt + Math.random() * 300;
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
}

export function subscribeToSubgraph<TData = unknown>(
  payload: SubscribePayload,
  {
    onData,
    onError,
    onComplete,
  }: {
    onData: (data: TData) => void;
    onError?: (error: Error) => void;
    onComplete?: () => void;
  },
): () => void {
  if (!SUBGRAPH_WS_URL) {
    return () => {};
  }

  const client = createClient({ url: SUBGRAPH_WS_URL });

  const dispose = client.subscribe<TData>(payload, {
    next: (result: SubscriptionResult<TData>) => {
      if (result.data) {
        onData(result.data);
      }
      if (result.errors?.length) {
        const error = result.errors[0];
        onError?.(new Error(error.message));
      }
    },
    error: (error: unknown) => {
      if (error instanceof Error) {
        onError?.(error);
        return;
      }
      onError?.(new Error(typeof error === 'string' ? error : 'Unknown subscription error'));
    },
    complete: () => {
      onComplete?.();
    },
  });

  return () => {
    dispose();
  };
}

