import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { Sprint } from '@/types';

export interface SprintsParams {
  projectId?: string;
  includeTasks?: boolean;
  includeStats?: boolean;
}

/** Stable query key for a given sprints query (mirrors the request params). */
export const sprintsKey = (params: SprintsParams = {}) => ['sprints', params] as const;

function buildSprintsQuery(params: SprintsParams): string {
  const qs = new URLSearchParams();
  if (params.projectId) qs.append('projectId', params.projectId);
  if (params.includeTasks) qs.append('includeTasks', 'true');
  if (params.includeStats) qs.append('include', 'stats');
  const query = qs.toString();
  return query ? `?${query}` : '';
}

/**
 * The sprints list — the single shared source for sprint state.
 * Mutations call {@link invalidateSprints} to refresh every consumer
 * (this replaced the old `sprints-updated` window event).
 *
 * Generic over the sprint shape so callers that request `includeTasks`
 * can type the result as a richer Sprint variant.
 */
export function useSprints<T extends Sprint = Sprint>(params: SprintsParams = {}) {
  return useQuery({
    queryKey: sprintsKey(params),
    queryFn: () =>
      apiGet<{ sprints: T[] }>(`/sprints${buildSprintsQuery(params)}`).then((d) => d.sprints),
  });
}

/** Refetch every sprints query everywhere it's used. Safe to call from any handler. */
export function invalidateSprints(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ['sprints'] });
}
