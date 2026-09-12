import { useEffect } from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { collectionSchema } from '../../../shared/schemas/collection';
import { ApiError, request } from '../../lib/api/auth';
import { useSession } from '../auth/session-context';

export const collectionKey = ['private', 'collection'] as const;
// Call only after a confirmed reward/trade mutation, never on optimistic UI.
export async function refreshCollection(client: QueryClient) {
  await client.invalidateQueries({ queryKey: collectionKey });
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('pokeswap-session');
    channel.postMessage('collection-changed');
    channel.close();
  }
}

export function useCollection() {
  const { profile, loading, action } = useSession();
  const client = useQueryClient();
  const userId = profile?.user.id;
  const query = useQuery({
    queryKey: [...collectionKey, userId],
    enabled:
      !!userId &&
      profile?.user.role === 'student' &&
      !loading &&
      action === 'idle',
    queryFn: async ({ signal }) => {
      const response = await request('/api/me/collection', { signal });
      const parsed = collectionSchema.safeParse(await response.json());
      if (!parsed.success) throw new ApiError('INVALID_RESPONSE');
      if (parsed.data.userId !== userId) throw new ApiError('SESSION_CHANGED');
      return parsed.data;
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });
  const { refetch } = query;
  useEffect(() => {
    if (
      query.error instanceof ApiError &&
      ['UNAUTHENTICATED', 'SESSION_CHANGED', 'FORBIDDEN'].includes(
        query.error.code,
      )
    ) {
      client.setQueryData(['private', 'session'], null);
    }
  }, [query.error, client]);
  useEffect(() => {
    if (!query.data?.nextRefreshAt || query.isError) return;
    const timer = window.setTimeout(
      () => {
        void refetch();
      },
      Math.min(
        2_147_483_647,
        Math.max(1000, query.data.nextRefreshAt * 1000 - Date.now()),
      ),
    );
    return () => window.clearTimeout(timer);
  }, [query.data, query.dataUpdatedAt, query.isError, refetch]);
  return query;
}
