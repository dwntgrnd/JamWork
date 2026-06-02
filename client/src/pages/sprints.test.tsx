import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { ReactElement } from 'react'
import SprintsPage from '@/pages/sprints'
import { apiGet } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  getErrorMessage: (e: unknown) => String(e),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedApiGet = apiGet as ReturnType<typeof vi.fn>

const DAY = 86_400_000
const now = Date.now()
const iso = (ms: number) => new Date(ms).toISOString()

function sprint(over: Record<string, unknown>) {
  return {
    id: 's',
    name: 'S',
    startDate: iso(now),
    endDate: iso(now + DAY),
    status: 'active',
    createdById: 'u1',
    createdAt: iso(now),
    updatedAt: iso(now),
    tasks: [],
    _count: { tasks: 0 },
    stats: { taskCount: 0, completedCount: 0 },
    ...over,
  }
}

// In progress today.
const currentSprint = sprint({
  id: 's-current',
  name: 'Current Sprint',
  startDate: iso(now - 10 * DAY),
  endDate: iso(now + 10 * DAY),
})
// Ended in the past but never closed — still status 'active'. This is the one
// the backlog dropdown used to drop (it was neither "current" nor "future").
const endedSprint = sprint({
  id: 's-ended',
  name: 'Ended Sprint',
  startDate: iso(now - 30 * DAY),
  endDate: iso(now - 5 * DAY),
})
const backlogTask = {
  id: 't1',
  title: 'Backlog Item',
  status: 'todo',
  priority: 'medium',
  projectId: 'p1',
  assignees: [],
}

beforeAll(() => {
  // Radix Select needs these to open in jsdom.
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.scrollIntoView = () => {}
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

beforeEach(() => {
  mockedApiGet.mockReset().mockImplementation((url: string) => {
    if (url.startsWith('/sprints')) return Promise.resolve({ sprints: [currentSprint, endedSprint] })
    if (url.startsWith('/tasks')) return Promise.resolve({ tasks: [backlogTask] })
    if (url === '/projects') return Promise.resolve({ projects: [] })
    if (url === '/auth/users') return Promise.resolve({ users: [] })
    return Promise.resolve({})
  })
})

afterEach(cleanup)

function renderPage(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('SprintsPage backlog assign dropdown', () => {
  it('offers every active sprint, including ended-but-not-closed ones', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderPage(<SprintsPage />)

    // The per-backlog-item "Assign sprint..." trigger.
    const valueEl = await screen.findByText('Assign sprint...')
    const trigger = valueEl.closest('[role="combobox"]') ?? valueEl
    await user.click(trigger)

    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByText('Current Sprint')).toBeInTheDocument()
    expect(within(listbox).getByText('Ended Sprint')).toBeInTheDocument()
  })
})
