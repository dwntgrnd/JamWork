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

describe('TaskFilters', () => {
  it('renders the status/priority/assignee filters', () => {
    render(<TaskFilters filters={filters} onChange={vi.fn()} />);
    expect(screen.getByText('Status:')).toBeInTheDocument();
    expect(screen.getByText('Priority:')).toBeInTheDocument();
    expect(screen.getByText('Assignee:')).toBeInTheDocument();
  });

  it('does not render a "Sort by" control — list views sort via column headers, and board/timeline ignore sort', () => {
    render(<TaskFilters filters={filters} onChange={vi.fn()} />);
    expect(screen.queryByText('Sort by:')).not.toBeInTheDocument();
  });
});
