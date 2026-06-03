import { describe, it, expect, vi } from 'vitest'
import { handleAuthError, shouldRetry } from '@/lib/query-client'
import { ApiError } from '@/lib/api'

describe('handleAuthError — global 401 funnel', () => {
  it('redirects to /login on a 401 and reports handled', () => {
    const redirect = vi.fn()
    expect(handleAuthError(new ApiError(401, 'Session expired'), redirect)).toBe(true)
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('does NOT redirect on a 5xx (server down is not a logout)', () => {
    const redirect = vi.fn()
    expect(handleAuthError(new ApiError(503, 'unavailable'), redirect)).toBe(false)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('ignores non-ApiError values', () => {
    const redirect = vi.fn()
    expect(handleAuthError(new Error('network'), redirect)).toBe(false)
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('shouldRetry — do not hammer on failures that will not change', () => {
  it('never retries client errors (4xx) — avoids draining the login rate limit', () => {
    expect(shouldRetry(0, new ApiError(401, 'x'))).toBe(false)
    expect(shouldRetry(0, new ApiError(404, 'x'))).toBe(false)
  })

  it('retries a 5xx once', () => {
    expect(shouldRetry(0, new ApiError(503, 'x'))).toBe(true)
    expect(shouldRetry(1, new ApiError(503, 'x'))).toBe(false)
  })

  it('retries a network error once', () => {
    expect(shouldRetry(0, new Error('network'))).toBe(true)
    expect(shouldRetry(1, new Error('network'))).toBe(false)
  })
})
