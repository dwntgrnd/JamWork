import { useCallback } from 'react';
import { Project } from '@/types';
import { useProjects, invalidateProjects, patchCachedProject } from '@/hooks/use-projects';

/**
 * A single project (by id), derived from the shared projects query.
 *
 * Kept as a thin adapter over {@link useProjects} so existing callers keep the
 * `{ project, loading, setProject, refetch }` shape. `setProject` applies an
 * optimistic cache update; `refetch` re-runs the projects query — both formerly
 * coordinated via the `projects-updated` window event.
 */
export function useProject(projectId?: string) {
  const { data: projects, isLoading } = useProjects();
  const project = projects?.find((p) => p.id === projectId) ?? null;

  const setProject = useCallback((updated: Project) => {
    patchCachedProject(updated);
  }, []);

  const refetch = useCallback(() => {
    invalidateProjects();
  }, []);

  return { project, loading: isLoading, setProject, refetch };
}
