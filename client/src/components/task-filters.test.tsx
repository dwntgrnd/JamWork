import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TaskFilters } from '@/components/task-filters';
import type { TaskFilterState } from '@/types';

// The filter bar fetches the user list on mount; stub it so the test stays focused.
vi.mock('@/lib/api', () => ({
  apiGet: vi.fn().mockResolvedValue({ users: [] }),
}));

afterEach(cleanup);

const filters: TaskFilterState = {
  showCompleted: true,
  sortBy: 'sortOrder',
  sortDir: 'asc',
};

describe('TaskFilters sort control', () => {
  it('shows the "Sort by" dropdown by default', () => {
    render(<TaskFilters filters={filters} onChange={vi.fn()} />);
    expect(screen.getByText('Sort by:')).toBeInTheDocument();
  });

  it('hides the "Sort by" dropdown when showSortControl is false', () => {
    render(<TaskFilters filters={filters} onChange={vi.fn()} showSortControl={false} />);
    expect(screen.queryByText('Sort by:')).not.toBeInTheDocument();
  });
});
