import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiGet, apiPut } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import type { SidebarPreferences, SidebarView, UserPreferences } from '@/types/preferences';

export const PREFERENCES_KEY = ['preferences', 'sidebar'] as const;

/**
 * The caller's sidebar preferences, normalized to defaults (view "all", empty
 * curated list) whenever the server has nothing stored. Loaded once on mount;
 * switching All/Mine and editing the list never re-fetches the project data —
 * filtering happens client-side from the full list already in memory.
 */
export function useSidebarPreferences() {
  return useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: async (): Promise<SidebarPreferences> => {
      const { preferences } = await apiGet<{ preferences: UserPreferences }>('/user/preferences');
      const sidebar = preferences?.sidebar;
      const pinned = sidebar?.pinnedProjects;
      const view: SidebarView = sidebar?.view === 'mine' ? 'mine' : 'all';
      return {
        view,
        pinnedProjects: Array.isArray(pinned) ? pinned : [],
      };
    },
  });
}

/**
 * Persist the full sidebar preferences (always sends both view + pinnedProjects,
 * since the server replaces the whole `sidebar` namespace). Optimistic: the
 * cache updates instantly so the sidebar re-renders without waiting on the
 * round-trip, and rolls back to the prior value if the PUT fails.
 */
export function useUpdateSidebarPreferences() {
  return useMutation({
    mutationFn: (sidebar: SidebarPreferences) =>
      apiPut<{ preferences: UserPreferences }>('/user/preferences', { sidebar }),
    onMutate: async (sidebar) => {
      await queryClient.cancelQueries({ queryKey: PREFERENCES_KEY });
      const previous = queryClient.getQueryData<SidebarPreferences>(PREFERENCES_KEY);
      queryClient.setQueryData<SidebarPreferences>(PREFERENCES_KEY, sidebar);
      return { previous };
    },
    onError: (_err, _sidebar, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(PREFERENCES_KEY, context.previous);
      }
      // Don't let the switch silently snap back — say why, and that we reverted.
      toast.error("Couldn't save your sidebar preferences. The previous setting was restored.");
    },
  });
}
