import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import type { ReactElement } from 'react'
import MyTasksPage from '@/pages/my-tasks'
import { ErrorBoundary } from '@/components/error-boundary'

// Keep every query in the loading state (data === undefined) for the whole
// render — that's the window where TaskList's `const { data: tasks = [] }`
// default produced a fresh [] each render, which used to drive an infinite
// selection-sync loop (Maximum update depth exceeded).
vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(() => new Promise(() => {})),
  apiPut: vi.fn(() => new Promise(() => {})),
  apiPost: vi.fn(() => new Promise(() => {})),
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', displayName: 'U', email: 'u@example.com', role: 'member' },
    loading: false,
  }),
}))

function renderApp(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ErrorBoundary>{ui}</ErrorBoundary>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MyTasksPage', () => {
  afterEach(cleanup)

  it('mounts in the loading state without an infinite render loop', () => {
    renderApp(<MyTasksPage />)

    // If TaskList loops, the ErrorBoundary catches "Maximum update depth
    // exceeded" and renders its fallback instead of the page.
    expect(screen.getByRole('heading', { name: /my tasks/i })).toBeInTheDocument()
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
  })
})
