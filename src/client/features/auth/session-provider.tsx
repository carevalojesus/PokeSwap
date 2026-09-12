import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ApiError,
  authenticate,
  getSession,
  revokeSession,
} from '../../lib/api/auth';
import { SessionContext, type SessionAction } from './session-context';
import type { LoginInput } from '../../../shared/schemas/auth';
import type { RegistrationInput } from '../../../shared/schemas/registration';

const sessionKey = ['private', 'session'] as const;

function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [action, setAction] = useState<SessionAction>('idle');
  const locked = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const query = useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) => getSession(signal),
    enabled: action === 'idle',
    staleTime: 30_000,
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    refetchOnWindowFocus: 'always',
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
  });
  const { refetch } = query;
  useEffect(() => {
    if (!query.data || action !== 'idle') return;
    const delay = Math.max(0, query.data.session.expiresAt * 1000 - Date.now());
    const timer = window.setTimeout(
      () => {
        void refetch();
      },
      Math.min(delay, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [query.data, action, refetch]);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const connection = new BroadcastChannel('pokeswap-session');
    channel.current = connection;
    connection.onmessage = async (event: MessageEvent<unknown>) => {
      if (event.data !== 'changed' || locked.current) return;
      await client.cancelQueries();
      client.clear();
      void refetch();
    };
    return () => {
      connection.close();
      channel.current = null;
    };
  }, [client, refetch]);

  async function signIn(
    kind: 'login' | 'register',
    input: LoginInput | RegistrationInput,
  ) {
    if (locked.current) throw new ApiError('REQUEST_IN_PROGRESS');
    locked.current = true;
    setAction('auth');
    await client.cancelQueries();
    client.clear();
    try {
      // Credentials live only in this request/form, never in a mutation cache.
      const result = await authenticate(kind, input);
      const confirmed = await getSession(new AbortController().signal);
      if (!confirmed || confirmed.user.id !== result.user.id)
        throw new ApiError('SESSION_NOT_CONFIRMED');
      client.setQueryData(sessionKey, confirmed);
      channel.current?.postMessage('changed');
      return confirmed;
    } catch (error) {
      client.clear();
      client.setQueryData(sessionKey, null);
      throw error;
    } finally {
      locked.current = false;
      setAction('idle');
    }
  }
  async function signOut() {
    if (locked.current) return false;
    locked.current = true;
    setAction('logout');
    await client.cancelQueries();
    // Hide and discard private data immediately, even if the network fails.
    client.clear();
    try {
      await revokeSession();
      client.setQueryData(sessionKey, null);
      channel.current?.postMessage('changed');
      setAction('idle');
      return true;
    } catch {
      setAction('logout-failed');
      return false;
    } finally {
      locked.current = false;
    }
  }
  const loading = query.isPending || query.isFetching;
  const profile =
    action === 'idle' && !loading && !query.isError
      ? (query.data ?? null)
      : null;
  return (
    <SessionContext.Provider
      value={{
        profile,
        canSignOut: !!query.data,
        loading,
        failed: query.isError,
        action,
        retry: () => {
          void refetch();
        },
        signIn,
        signOut,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function SessionRoot({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0, networkMode: 'always' },
          mutations: { retry: false, gcTime: 0, networkMode: 'always' },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
