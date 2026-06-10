import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadReportMarkdown } from '@/lib/download'

describe('downloadReportMarkdown', () => {
  let clickSpy: ReturnType<typeof vi.fn>
  let createdAnchor: HTMLAnchorElement

  beforeEach(() => {
    clickSpy = vi.fn()
    vi.stubGlobal('fetch', vi.fn())
    // Stub object-URL lifecycle (jsdom lacks createObjectURL).
    URL.createObjectURL = vi.fn(() => 'blob:fake-url')
    URL.revokeObjectURL = vi.fn()

    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLAnchorElement
      if (tag === 'a') {
        createdAnchor = el
        el.click = clickSpy
      }
      return el
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fetches the markdown endpoint with credentials and triggers an anchor download', async () => {
    const blob = new Blob(['# Report'], { type: 'text/markdown' })
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(blob),
      headers: { get: () => 'attachment; filename="status-report-r1.md"' },
    })

    await downloadReportMarkdown('r1')

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/reports/r1/markdown'),
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(clickSpy).toHaveBeenCalled()
    expect(createdAnchor.download).toBe('status-report-r1.md')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
  })

  it('falls back to status-report-{id}.md when no Content-Disposition filename', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'])),
      headers: { get: () => null },
    })

    await downloadReportMarkdown('abc')

    expect(createdAnchor.download).toBe('status-report-abc.md')
  })

  it('throws on a non-ok response (no download triggered)', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
    })

    await expect(downloadReportMarkdown('missing')).rejects.toThrow()
    expect(clickSpy).not.toHaveBeenCalled()
  })
})
