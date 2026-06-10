import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { useReports, useReport, invalidateReports } from '@/hooks/use-reports'
import { apiGet } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(),
}))

const mockedApiGet = apiGet as ReturnType<typeof vi.fn>

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children)

const summary = { id: 'r1', generatedAt: '2026-06-10T00:00:00+00:00', type: 'ad_hoc', triggeredBy: null }
const detail = { id: 'r1', generatedAt: '2026-06-10T00:00:00+00:00', type: 'ad_hoc', triggeredBy: null, windowDays: 14, payload: { projects: [] } }

describe('use-reports', () => {
  beforeEach(() => {
    queryClient.clear()
    mockedApiGet.mockReset()
  })
  afterEach(cleanup)

  it('useReports fetches GET /reports and returns the reports array', async () => {
    mockedApiGet.mockResolvedValue({ reports: [summary] })

    const { result } = renderHook(() => useReports(), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(mockedApiGet).toHaveBeenCalledWith('/reports')
    expect(result.current.data).toEqual([summary])
  })

  it('useReport fetches GET /reports/{id} and returns the detail object', async () => {
    mockedApiGet.mockResolvedValue({ report: detail })

    const { result } = renderHook(() => useReport('r1'), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(mockedApiGet).toHaveBeenCalledWith('/reports/r1')
    expect(result.current.data).toEqual(detail)
  })

  it('useReport does not fetch when id is undefined', async () => {
    const { result } = renderHook(() => useReport(undefined), { wrapper })

    expect(mockedApiGet).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('invalidateReports refetches every report query', async () => {
    mockedApiGet.mockResolvedValue({ reports: [summary] })
    renderHook(() => useReports(), { wrapper })

    await waitFor(() => expect(mockedApiGet).toHaveBeenCalledTimes(1))

    await act(async () => {
      await invalidateReports()
    })

    await waitFor(() => expect(mockedApiGet).toHaveBeenCalledTimes(2))
  })
})
