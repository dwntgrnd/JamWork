import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { AuthProvider } from '@/hooks/auth-provider'
import { useAuth } from '@/hooks/use-auth'

// Stub at the fetch layer (not apiGet) so the real wrapper turns the response into
// an ApiError — the realistic path, and it avoids vi.fn rejected-promise artifacts.
function mockFetchStatus(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: '',
      json: async () => body,
    }),
  )
}

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(AuthProvider, null, children)

describe('AuthProvider — session check distinguishes auth failure from server failure', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
  })

  it('clears the user on a 401 (genuinely not authenticated)', async () => {
    mockFetchStatus(401, { error: 'Session expired' })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(result.current.serverError).toBe(false)
  })

  it('flags serverError on a 5xx and does NOT pretend the user is logged out', async () => {
    mockFetchStatus(503, { error: 'unavailable' })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.serverError).toBe(true)
  })

  it('sets the user and clears serverError on success', async () => {
    mockFetchStatus(200, { user: { id: 'u1', email: 'a@b.c' } })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toMatchObject({ id: 'u1' })
    expect(result.current.serverError).toBe(false)
  })
})
