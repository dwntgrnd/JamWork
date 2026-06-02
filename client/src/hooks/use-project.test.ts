import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { useProject } from '@/hooks/use-project'
import { invalidateProjects } from '@/hooks/use-projects'
import { apiGet } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(),
}))

const mockedApiGet = apiGet as ReturnType<typeof vi.fn>

// Drives useProject through the real query client so invalidateProjects() — which
// targets that same singleton — exercises the refetch path that replaced the
// `projects-updated` window event (the 4.2 seam).
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children)

describe('useProject — projects cache seam', () => {
  beforeEach(() => {
    queryClient.clear()
    mockedApiGet.mockReset()
    mockedApiGet.mockResolvedValue({ projects: [{ id: 'p1', name: 'Alpha' }] })
  })
  afterEach(cleanup)

  it('derives the matching project from the projects query', async () => {
    const { result } = renderHook(() => useProject('p1'), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockedApiGet).toHaveBeenCalledWith('/projects')
    expect(result.current.project).toMatchObject({ id: 'p1', name: 'Alpha' })
  })

  it('refetches when the projects cache is invalidated (the 4.2 seam)', async () => {
    renderHook(() => useProject('p1'), { wrapper })

    await waitFor(() => expect(mockedApiGet).toHaveBeenCalledTimes(1))

    await act(async () => {
      await invalidateProjects()
    })

    await waitFor(() => expect(mockedApiGet).toHaveBeenCalledTimes(2))
  })
})
