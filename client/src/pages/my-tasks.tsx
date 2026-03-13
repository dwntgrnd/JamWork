import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Task } from '@/types';
import { TaskList } from '@/components/task-list';
import { TaskFilters } from '@/components/task-filters';
import { TaskDrawer } from '@/components/task-drawer';
import { BulkActionBar } from '@/components/bulk-action-bar';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useFilterParams } from '@/hooks/use-filter-params';

export default function MyTasksPage() {
  const { user } = useAuth();
  const { filters, setFilters } = useFilterParams({ defaultSortBy: 'dueDate', defaultSortDir: 'asc' });
  const [showTaskDrawer, setShowTaskDrawer] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleSelectionChange = (ids: Set<string>, tasks: Task[]) => {
    setSelectedTaskIds(ids);
    setSelectedTasks(tasks);
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold text-foreground">My Tasks</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Tasks assigned to you across all projects
            </p>
          </div>

          <Button variant="emphasis" className="rounded-lg px-5 gap-2 font-semibold" onClick={() => setShowTaskDrawer(true)}>
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        </div>

        <div className="mb-6">
          {selectedTaskIds.size > 0 ? (
            <BulkActionBar
              selectedTaskIds={selectedTaskIds}
              tasks={selectedTasks}
              onActionComplete={() => {
                setSelectedTaskIds(new Set());
                setSelectedTasks([]);
                handleRefresh();
              }}
              onClearSelection={() => {
                setSelectedTaskIds(new Set());
                setSelectedTasks([]);
              }}
            />
          ) : (
            <TaskFilters filters={filters} onChange={setFilters} />
          )}
        </div>

        <TaskList
          assigneeId="me"
          filters={filters}
          refreshKey={refreshKey}
          onRefresh={handleRefresh}
          onSelectionChange={handleSelectionChange}
        />

        {showTaskDrawer && (
          <TaskDrawer
            mode="create"
            onSave={() => {
              handleRefresh();
              setShowTaskDrawer(false);
            }}
            onClose={() => setShowTaskDrawer(false)}
          />
        )}
      </div>
    </div>
  );
}
