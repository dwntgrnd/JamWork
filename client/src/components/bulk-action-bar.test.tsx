import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BulkActionBar } from '@/components/bulk-action-bar'
import { apiGet, apiPut } from '@/lib/api'
import { invalidateProjects } from '@/hooks/use-projects'
import type { Task } from '@/types'

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
// The component now refreshes project state via cache invalidation (post event-bus removal).
vi.mock('@/hooks/use-projects', () => ({
  invalidateProjects: vi.fn(),
}))

const mockedApiGet = apiGet as ReturnType<typeof vi.fn>
const mockedApiPut = apiPut as ReturnType<typeof vi.fn>
const mockedInvalidateProjects = invalidateProjects as ReturnType<typeof vi.fn>

// Minimal task shape — only id/status are read by the component under test.
const task = { id: 't1', status: 'todo' } as unknown as Task

describe('BulkActionBar — Mark as Done', () => {
  beforeEach(() => {
    mockedApiGet.mockReset().mockResolvedValue({ sprints: [] })
    mockedApiPut.mockReset().mockResolvedValue({})
    mockedInvalidateProjects.mockReset()
  })
  afterEach(cleanup)

  it('bulk-updates status to done and invalidates the projects cache', async () => {
    const onActionComplete = vi.fn()

    render(
      <BulkActionBar
        selectedTaskIds={new Set(['t1'])}
        tasks={[task]}
        onActionComplete={onActionComplete}
        onClearSelection={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /mark as done/i }))

    await waitFor(() => {
      expect(mockedApiPut).toHaveBeenCalledWith('/tasks/bulk-update', {
        taskIds: ['t1'],
        fields: { status: 'done' },
      })
      expect(mockedInvalidateProjects).toHaveBeenCalled()
      expect(onActionComplete).toHaveBeenCalled()
    })
  })
})
