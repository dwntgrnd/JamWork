import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryClient } from '@/lib/query-client';

export const WORKSPACE_NAME_KEY = ['workspace-name'] as const;

/** The workspace display name, defaulting to "JamWork" until loaded. */
export function useWorkspaceName(): string {
  const { data } = useQuery({
    queryKey: WORKSPACE_NAME_KEY,
    queryFn: () => apiGet<{ workspaceName: string }>('/workspace-settings').then((d) => d.workspaceName),
  });
  return data ?? 'JamWork';
}

/** Push a new workspace name into the cache (replaces the workspace-name-updated event). */
export function setCachedWorkspaceName(name: string): void {
  queryClient.setQueryData(WORKSPACE_NAME_KEY, name);
}
