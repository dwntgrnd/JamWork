import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { ApiError } from './api';

/**
 * App-wide query client. Cache invalidation (queryClient.invalidateQueries)
 * replaces the old window CustomEvent bus for cross-component state sync.
 *
 * refetchOnWindowFocus is disabled to preserve the app's prior behavior
 * (data refreshed on explicit mutations, not on tab focus).
 *
 * Error policy:
 *  - Any 401 (session invalid) funnels to the login page from one place, so a
 *    stale session can't linger as silently-empty lists. 5xx / network failures
 *    are NOT treated as a logout — those surface as error states in the UI.
 *  - We don't retry 4xx (they won't change, and retrying login-area requests
 *    would needlessly consume the login rate-limit budget).
 */

function defaultRedirect(path: string): void {
  window.location.href = path;
}

/** Returns true and redirects to login iff the error is a 401. */
export function handleAuthError(
  error: unknown,
  redirect: (path: string) => void = defaultRedirect,
): boolean {
  if (error instanceof ApiError && error.status === 401) {
    redirect('/login');
    return true;
  }
  return false;
}

/** Retry 5xx / network errors once; never retry client (4xx) errors. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: shouldRetry,
    },
    mutations: {
      retry: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error) => handleAuthError(error),
  }),
  mutationCache: new MutationCache({
    onError: (error) => handleAuthError(error),
  }),
});
