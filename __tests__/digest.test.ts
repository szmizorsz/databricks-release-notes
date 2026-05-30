import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/scraper', () => ({ scrapeReleaseNotes: vi.fn() }))
vi.mock('@/lib/summarizer', () => ({ generateNarrativeSummary: vi.fn() }))
vi.mock('@/lib/emailer', () => ({ sendDigestEmail: vi.fn() }))
vi.mock('@/lib/kv', () => ({ getConfig: vi.fn(), appendRun: vi.fn() }))

import { scrapeReleaseNotes } from '@/lib/scraper'
import { generateNarrativeSummary } from '@/lib/summarizer'
import { sendDigestEmail } from '@/lib/emailer'
import { getConfig, appendRun } from '@/lib/kv'
import { runDigest } from '@/lib/digest'

const mockScrape = vi.mocked(scrapeReleaseNotes)
const mockSummarize = vi.mocked(generateNarrativeSummary)
const mockEmail = vi.mocked(sendDigestEmail)
const mockGetConfig = vi.mocked(getConfig)
const mockAppendRun = vi.mocked(appendRun)

beforeEach(() => {
  vi.clearAllMocks()
  mockAppendRun.mockResolvedValue(undefined)
})

describe('runDigest', () => {
  it('returns error when no email configured', async () => {
    mockGetConfig.mockResolvedValueOnce(null)

    const result = await runDigest()

    expect(result.status).toBe('error')
    expect(result.error).toContain('No target email configured')
    expect(mockAppendRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }))
    expect(mockEmail).not.toHaveBeenCalled()
  })

  it('returns skipped when no items scraped', async () => {
    mockGetConfig.mockResolvedValueOnce({ email: 'user@example.com' })
    mockScrape.mockResolvedValueOnce([])

    const result = await runDigest()

    expect(result.status).toBe('skipped')
    expect(result.itemCount).toBe(0)
    expect(mockEmail).not.toHaveBeenCalled()
    expect(mockAppendRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }))
  })

  it('scrapes, summarizes, emails, and logs on success', async () => {
    const items = [{ category: 'Platform', text: 'Feature A', descriptionHtml: '<p>Feature A details.</p>', sourceUrl: 'https://docs.databricks.com/release-notes/product/' }]
    mockGetConfig.mockResolvedValueOnce({ email: 'user@example.com' })
    mockScrape.mockResolvedValueOnce(items)
    mockSummarize.mockResolvedValueOnce('Great summary.')
    mockEmail.mockResolvedValueOnce(undefined)

    const result = await runDigest()

    expect(result.status).toBe('success')
    expect(result.itemCount).toBe(1)
    expect(mockSummarize).toHaveBeenCalledWith(items)
    expect(mockEmail).toHaveBeenCalledWith('user@example.com', expect.any(Date), items, 'Great summary.')
    expect(mockAppendRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', itemCount: 1 }))
  })

  it('returns error when scrape throws', async () => {
    mockGetConfig.mockResolvedValueOnce({ email: 'user@example.com' })
    mockScrape.mockRejectedValueOnce(new Error('Network error'))

    const result = await runDigest()

    expect(result.status).toBe('error')
    expect(result.error).toContain('Network error')
    expect(mockAppendRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }))
  })
})
