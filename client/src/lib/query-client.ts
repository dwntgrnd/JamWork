import { QueryClient } from '@tanstack/react-query';

/**
 * App-wide query client. Cache invalidation (queryClient.invalidateQueries)
 * replaces the old window CustomEvent bus for cross-component state sync.
 *
 * refetchOnWindowFocus is disabled to preserve the app's prior behavior
 * (data refreshed on explicit mutations, not on tab focus).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
