import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { Project } from '@/types';

/**
 * Fetches a single project (by id) and keeps it fresh.
 *
 * Listens for the `projects-updated` window event — dispatched by task mutations
 * (create/delete/status change) and project edits — so derived values like the
 * open-task count (`_count.tasks`) stay current without a full page reload.
 *
 * `setProject` lets callers apply an optimistic update (e.g. after saving settings);
 * `refetch` forces a reload on demand.
 */
export function useProject(projectId?: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const data = await apiGet<{ projects: Project[] }>('/projects');
      const current = data.projects.find((p) => p.id === projectId);
      if (current) setProject(current);
    } catch (err) {
      console.error('Failed to fetch project:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    refetch();
    const handler = () => refetch();
    window.addEventListener('projects-updated', handler);
    return () => window.removeEventListener('projects-updated', handler);
  }, [refetch]);

  return { project, loading, setProject, refetch };
}
