import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router';
import { apiGet } from '@/lib/api';
import { Project } from '@/types';
import { BoardView } from '@/components/board-view';
import { TaskFilters } from '@/components/task-filters';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFilterParams } from '@/hooks/use-filter-params';
import { ProjectPageSkeleton } from '@/components/project-page-skeleton';
import { ProjectNotFound } from '@/components/project-not-found';

export default function BoardPage() {
  const { id: projectId } = useParams();
  const [searchParams] = useSearchParams();

  const { filters, setFilters } = useFilterParams({ defaultSortBy: 'sortOrder', defaultSortDir: 'asc' });
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      setLoading(true);
      const data = await apiGet<{ projects: Project[] }>('/projects');
      const currentProject = data.projects.find((p) => p.id === projectId);
      if (currentProject) {
        setProject(currentProject);
      }
    } catch (err) {
      console.error('Failed to fetch project:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ProjectPageSkeleton />;
  if (!project) return <ProjectNotFound />;

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-foreground">{project.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {project._count?.tasks || 0} tasks
          </p>
        </div>

        <div className="mb-6">
          <Tabs value="board" className="w-full">
            <TabsList>
              <TabsTrigger value="list" asChild>
                <Link to={`/projects/${projectId}?${searchParams.toString()}`}>List</Link>
              </TabsTrigger>
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="timeline" asChild>
                <Link to={`/projects/${projectId}/timeline?${searchParams.toString()}`}>Timeline</Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mb-6">
          <TaskFilters filters={filters} onChange={setFilters} hideProjectFilter />
        </div>

        <BoardView projectId={projectId!} filters={filters} />
      </div>
    </div>
  );
}
