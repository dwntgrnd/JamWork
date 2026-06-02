import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { Project } from '@/types';

export const PROJECTS_KEY = ['projects'] as const;

/**
 * The projects list — the single shared source for project state.
 * Mutations call {@link invalidateProjects} to refresh every consumer
 * (this replaced the old `projects-updated` window event).
 */
export function useProjects() {
  return useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: () => apiGet<{ projects: Project[] }>('/projects').then((d) => d.projects),
  });
}

/** Refetch the projects list everywhere it's used. Safe to call from any handler. */
export function invalidateProjects(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
}

/** Apply an optimistic update to a single cached project (e.g. after settings save). */
export function patchCachedProject(updated: Project): void {
  queryClient.setQueryData<Project[]>(PROJECTS_KEY, (prev) =>
    prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev,
  );
}
