import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { Sidebar } from '@/components/sidebar'
import { apiGet } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(() => Promise.resolve({ projects: [] })),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  getErrorMessage: (e: unknown) => String(e),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedApiGet = apiGet as ReturnType<typeof vi.fn>

function renderSidebar(ui: ReactElement, route = '/my-tasks') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Sidebar — Reports nav item', () => {
  beforeEach(() => {
    queryClient.clear()
    mockedApiGet.mockReset().mockResolvedValue({ projects: [] })
  })
  afterEach(cleanup)

  it('renders a Reports link pointing to /reports', () => {
    renderSidebar(<Sidebar collapsed={false} onToggle={() => {}} />)

    const link = screen.getByText('Reports').closest('a')
    expect(link).toHaveAttribute('href', '/reports')
  })

  it('places Reports immediately after Sprints', () => {
    renderSidebar(<Sidebar collapsed={false} onToggle={() => {}} />)

    const sprints = screen.getByText('Sprints')
    const reports = screen.getByText('Reports')
    // Reports follows Sprints in document order.
    expect(sprints.compareDocumentPosition(reports) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('marks Reports active when on /reports', () => {
    renderSidebar(<Sidebar collapsed={false} onToggle={() => {}} />, '/reports')

    const link = screen.getByText('Reports').closest('a')
    expect(link).toHaveAttribute('aria-current', 'page')
  })
})
