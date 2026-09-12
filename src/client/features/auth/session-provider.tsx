import type { AuthenticatedProfile } from '../../../shared/contracts/auth';
import { limaDate } from '../../../shared/schemas/registration';
import type { ProfileUpdate } from '../../../shared/schemas/profile';
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
  patchProfile,
} from '../../lib/api/auth';
import { SessionContext, type SessionAction } from './session-context';
import type { LoginInput } from '../../../shared/schemas/auth';
import type { RegistrationInput } from '../../../shared/schemas/registration';

const sessionKey = ['private', 'session'] as const;

function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [action, setAction] = useState<SessionAction>('idle');
  const locked = useRef(false);
  const generation = useRef(0);
  const profileRequests = useRef(new Set<AbortController>());
  function cancelProfileRequests() {
    generation.current++;
    for (const controller of profileRequests.current) controller.abort();
    profileRequests.current.clear();
  }
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
    const now = Date.now();
    const nextLimaDay =
      Date.parse(`${limaDate(new Date(now))}T00:00:00-05:00`) + 86_400_000;
    const delay = Math.max(
      0,
      Math.min(query.data.session.expiresAt * 1000, nextLimaDay) - now,
    );
    const timer = window.setTimeout(
      () => {
        void refetch();
      },
      Math.min(delay, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [query.data, query.dataUpdatedAt, action, refetch]);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const connection = new BroadcastChannel('pokeswap-session');
    channel.current = connection;
    connection.onmessage = async (event: MessageEvent<unknown>) => {
      if (locked.current) return;
      if (event.data === 'profile-changed') {
        void refetch();
        return;
      }
      if (event.data !== 'changed') return;
      cancelProfileRequests();
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
    cancelProfileRequests();
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
    cancelProfileRequests();
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
  async function updateProfile(input?: ProfileUpdate) {
    const userId = query.data?.user.id;
    const started = generation.current;
    if (!userId || locked.current) throw new ApiError('UNAUTHENTICATED');
    const controller = new AbortController();
    profileRequests.current.add(controller);
    try {
      const result = input
        ? await patchProfile(input, controller.signal)
        : await getSession(controller.signal);
      if (generation.current !== started || locked.current)
        throw new ApiError('SESSION_CHANGED');
      await client.cancelQueries();
      if (generation.current !== started || locked.current)
        throw new ApiError('SESSION_CHANGED');
      if (
        client.getQueryData<AuthenticatedProfile | null>(sessionKey)?.user
          .id !== userId
      )
        throw new ApiError('SESSION_CHANGED');
      if (!result || result.user.id !== userId) {
        client.clear();
        client.setQueryData(sessionKey, null);
        throw new ApiError('UNAUTHENTICATED');
      }
      client.setQueryData(sessionKey, result);
      if (input) channel.current?.postMessage('profile-changed');
      return result;
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 'UNAUTHENTICATED' &&
        generation.current === started
      ) {
        client.clear();
        client.setQueryData(sessionKey, null);
      }
      throw error;
    } finally {
      profileRequests.current.delete(controller);
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
        retainedProfile: action === 'idle' ? (query.data ?? null) : null,
        updateProfile,
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
