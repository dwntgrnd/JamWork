import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { Task } from '@/types';

export interface TasksParams {
  projectId?: string;
  assigneeId?: string;
  status?: string;
  priority?: string;
  excludeCompleted?: boolean;
  sortBy?: string;
  sortDir?: string;
}

/** Stable query key for a given tasks query (mirrors the request params). */
export const tasksKey = (params: TasksParams = {}) => ['tasks', params] as const;

function buildTasksQuery(params: TasksParams): string {
  const qs = new URLSearchParams();
  if (params.projectId) qs.append('projectId', params.projectId);
  if (params.assigneeId) qs.append('assigneeId', params.assigneeId);
  if (params.status) qs.append('status', params.status);
  if (params.priority) qs.append('priority', params.priority);
  if (params.excludeCompleted) qs.append('excludeCompleted', 'true');
  if (params.sortBy) qs.append('sortBy', params.sortBy);
  if (params.sortDir) qs.append('sortDir', params.sortDir);
  const query = qs.toString();
  return query ? `?${query}` : '';
}

/**
 * The tasks list for a given scope — the shared source for task state.
 * Mutations call {@link invalidateTasks} to refresh every consumer
 * (this replaced the old `tasks-updated` window event / refreshKey churn).
 */
export function useTasks(params: TasksParams = {}) {
  return useQuery({
    queryKey: tasksKey(params),
    queryFn: () =>
      apiGet<{ tasks: Task[] }>(`/tasks${buildTasksQuery(params)}`).then((d) => d.tasks),
  });
}

/** Refetch every tasks query everywhere it's used. Safe to call from any handler. */
export function invalidateTasks(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ['tasks'] });
}
