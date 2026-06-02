import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiGet } from '@/lib/api'

describe('apiGet / fetch wrapper', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns parsed JSON on a 2xx response', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ value: 42 }),
    })

    await expect(apiGet<{ value: number }>('/thing')).resolves.toEqual({ value: 42 })
    expect(fetch).toHaveBeenCalledWith('/api/thing', expect.objectContaining({ method: 'GET' }))
  })

  it('throws with the JSON error message and status on a non-2xx response', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    })

    await expect(apiGet('/missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Not found',
    })
  })

  it('falls back to statusText when the error body is not JSON', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => {
        throw new Error('not json')
      },
    })

    await expect(apiGet('/boom')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'Server Error',
    })
  })
})
