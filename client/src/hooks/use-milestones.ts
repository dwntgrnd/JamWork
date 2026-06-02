import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { Milestone } from '@/types';

export const MILESTONES_KEY = ['milestones'] as const;

/**
 * Milestones are global roadmap markers shared across every project.
 * Mutations call {@link invalidateMilestones} to refresh consumers.
 */
export function useMilestones() {
  return useQuery({
    queryKey: MILESTONES_KEY,
    queryFn: () => apiGet<{ milestones: Milestone[] }>('/milestones').then((d) => d.milestones),
  });
}

/** Refetch the milestones list everywhere it's used. */
export function invalidateMilestones(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: MILESTONES_KEY });
}
