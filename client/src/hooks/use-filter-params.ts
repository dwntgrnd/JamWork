import { useSearchParams } from 'react-router';
import { useCallback, useMemo } from 'react';
import { TaskFilterState } from '@/types';

interface UseFilterParamsOptions {
  defaultSortBy?: TaskFilterState['sortBy'];  // default: 'sortOrder'
  defaultSortDir?: TaskFilterState['sortDir']; // default: 'asc'
}

export function useFilterParams(options?: UseFilterParamsOptions): {
  filters: TaskFilterState;
  setFilters: (filters: TaskFilterState) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();

  const defaultSortBy = options?.defaultSortBy || 'sortOrder';
  const defaultSortDir = options?.defaultSortDir || 'asc';

  // Derive TaskFilterState from URL search params
  const filters = useMemo<TaskFilterState>(() => {
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const assigneeId = searchParams.get('assigneeId');
    const showCompleted = searchParams.get('showCompleted');
    const sortBy = searchParams.get('sortBy');
    const sortDir = searchParams.get('sortDir');

    return {
      status: status && status !== 'all' ? (status as TaskFilterState['status']) : undefined,
      priority: priority && priority !== 'all' ? (priority as TaskFilterState['priority']) : undefined,
      assigneeId: assigneeId && assigneeId !== 'all' ? assigneeId : undefined,
      showCompleted: showCompleted !== 'false',
      sortBy: (sortBy as TaskFilterState['sortBy']) || defaultSortBy,
      sortDir: (sortDir as TaskFilterState['sortDir']) || defaultSortDir,
    };
  }, [searchParams, defaultSortBy, defaultSortDir]);

  // Update URL search params when filters change
  const setFilters = useCallback((newFilters: TaskFilterState) => {
    const params = new URLSearchParams();

    // Only include non-default values
    if (newFilters.status) {
      params.set('status', newFilters.status);
    }
    if (newFilters.priority) {
      params.set('priority', newFilters.priority);
    }
    if (newFilters.assigneeId) {
      params.set('assigneeId', newFilters.assigneeId);
    }
    if (!newFilters.showCompleted) {
      params.set('showCompleted', 'false');
    }
    if (newFilters.sortBy && newFilters.sortBy !== defaultSortBy) {
      params.set('sortBy', newFilters.sortBy);
    }
    if (newFilters.sortDir && newFilters.sortDir !== defaultSortDir) {
      params.set('sortDir', newFilters.sortDir);
    }

    setSearchParams(params, { replace: true });
  }, [setSearchParams, defaultSortBy, defaultSortDir]);

  return { filters, setFilters };
}
