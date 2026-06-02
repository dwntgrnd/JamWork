import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'
import { useProject } from '@/hooks/use-project'
import { apiGet } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(),
}))

const mockedApiGet = apiGet as ReturnType<typeof vi.fn>

describe('useProject — projects-updated seam', () => {
  beforeEach(() => {
    mockedApiGet.mockReset()
    mockedApiGet.mockResolvedValue({ projects: [{ id: 'p1', name: 'Alpha' }] })
  })
  afterEach(() => {
    // Unmounts the hook, which removes the projects-updated listener via the
    // effect's cleanup — so a listener from one test can't fire in the next.
    cleanup()
  })

  it('fetches /projects and resolves the matching project', async () => {
    const { result } = renderHook(() => useProject('p1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockedApiGet).toHaveBeenCalledWith('/projects')
    expect(result.current.project).toMatchObject({ id: 'p1', name: 'Alpha' })
  })

  it('refetches when a projects-updated event fires (the 4.2 seam)', async () => {
    renderHook(() => useProject('p1'))

    await waitFor(() => expect(mockedApiGet).toHaveBeenCalledTimes(1))

    act(() => {
      window.dispatchEvent(new Event('projects-updated'))
    })

    await waitFor(() => expect(mockedApiGet).toHaveBeenCalledTimes(2))
  })
})
