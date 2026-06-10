import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectSettingsDialog } from '@/components/project-settings-dialog'
import { apiPut } from '@/lib/api'
import type { Project } from '@/types'

vi.mock('@/lib/api', () => ({
  apiPut: vi.fn(),
}))
vi.mock('@/hooks/use-projects', () => ({ invalidateProjects: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedApiPut = apiPut as ReturnType<typeof vi.fn>

const baseProject: Project = {
  id: 'p1',
  name: 'Alpha',
  createdById: 'u1',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
}

beforeAll(() => {
  // Radix primitives need these in jsdom.
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.scrollIntoView = () => {}
})

function renderDialog(over: Partial<Project> = {}) {
  return render(
    <ProjectSettingsDialog
      project={{ ...baseProject, ...over }}
      open={true}
      onOpenChange={() => {}}
      onSaved={() => {}}
    />,
  )
}

describe('ProjectSettingsDialog — includeInStatusReport toggle', () => {
  beforeEach(() => {
    mockedApiPut.mockReset().mockResolvedValue({ project: baseProject })
  })
  afterEach(cleanup)

  it('defaults the toggle ON and saves includeInStatusReport: true', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderDialog()

    expect(screen.getByLabelText('Include in status report')).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockedApiPut).toHaveBeenCalled())
    expect(mockedApiPut.mock.calls[0][1]).toMatchObject({ includeInStatusReport: true })
  })

  it('saves includeInStatusReport: false after toggling off', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderDialog()

    await user.click(screen.getByLabelText('Include in status report'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockedApiPut).toHaveBeenCalled())
    expect(mockedApiPut.mock.calls[0][1]).toMatchObject({ includeInStatusReport: false })
  })

  it('reflects an existing OFF value from the project prop', () => {
    renderDialog({ includeInStatusReport: false })

    expect(screen.getByLabelText('Include in status report')).not.toBeChecked()
  })
})
