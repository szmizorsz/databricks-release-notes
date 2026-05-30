import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockSend } }
  }),
}))

import { sendDigestEmail } from '@/lib/emailer'
import type { ScrapedItem } from '@/lib/types'

beforeEach(() => {
  vi.clearAllMocks()
  mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null })
})

const items: ScrapedItem[] = [
  { category: 'Platform', text: 'Unity Catalog update', descriptionHtml: '<p>Unity Catalog update details.</p>', sourceUrl: 'https://docs.databricks.com/release-notes/product/' },
  { category: 'Runtime', text: 'DBR 15.4 released', descriptionHtml: '<p>Runtime 15.4 details.</p>', sourceUrl: 'https://docs.databricks.com/release-notes/runtime/' },
  { category: 'SQL', text: 'AI Functions update', descriptionHtml: '<p>AI Functions details.</p>', sourceUrl: 'https://docs.databricks.com/sql/release-notes/' },
]

describe('sendDigestEmail', () => {
  it('sends to the specified address', async () => {
    await sendDigestEmail('user@example.com', new Date('2026-05-28T12:00:00Z'), items, 'Narrative text.')
    expect(mockSend.mock.calls[0][0].to).toBe('user@example.com')
  })

  it('includes formatted date in subject', async () => {
    await sendDigestEmail('user@example.com', new Date('2026-05-28T12:00:00Z'), items, 'Narrative.')
    expect(mockSend.mock.calls[0][0].subject).toContain('May 28, 2026')
  })

  it('includes section 1 bullet items in HTML body', async () => {
    await sendDigestEmail('user@example.com', new Date('2026-05-28T12:00:00Z'), items, 'Narrative.')
    const html = mockSend.mock.calls[0][0].html as string
    expect(html).toContain('Unity Catalog update')
    expect(html).toContain('DBR 15.4 released')
  })

  it('includes section 2 narrative in HTML body', async () => {
    await sendDigestEmail('user@example.com', new Date('2026-05-28T12:00:00Z'), items, 'The narrative text here.')
    expect(mockSend.mock.calls[0][0].html).toContain('The narrative text here.')
  })

  it('includes section 3 source URLs in HTML body', async () => {
    await sendDigestEmail('user@example.com', new Date('2026-05-28T12:00:00Z'), items, 'Narrative.')
    const html = mockSend.mock.calls[0][0].html as string
    expect(html).toContain('docs.databricks.com/release-notes/product/')
    expect(html).toContain('docs.databricks.com/release-notes/runtime/')
    expect(html).toContain('docs.databricks.com/sql/release-notes/')
  })

  it('groups items by category in section 1', async () => {
    await sendDigestEmail('user@example.com', new Date('2026-05-28T12:00:00Z'), items, 'Narrative.')
    const html = mockSend.mock.calls[0][0].html as string
    expect(html).toContain('Platform')
    expect(html).toContain('Runtime')
    expect(html).toContain('SQL')
  })

  it('throws when Resend returns an error', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'API error' } })
    await expect(
      sendDigestEmail('user@example.com', new Date('2026-05-28T12:00:00Z'), items, 'Narrative.')
    ).rejects.toThrow('Failed to send email: API error')
  })
})
