import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return { messages: { create: mockCreate } }
  }),
}))

import { generateNarrativeSummary } from '@/lib/summarizer'
import type { ScrapedItem } from '@/lib/types'

beforeEach(() => vi.clearAllMocks())

const items: ScrapedItem[] = [
  { category: 'Platform', text: 'Unity Catalog update', sourceUrl: 'https://docs.databricks.com/release-notes/product/' },
  { category: 'Runtime', text: 'DBR 15.4 LTS released', sourceUrl: 'https://docs.databricks.com/release-notes/runtime/' },
]

describe('generateNarrativeSummary', () => {
  it('returns text from Claude response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Today Databricks released several important updates.' }],
    })

    const result = await generateNarrativeSummary(items)
    expect(result).toBe('Today Databricks released several important updates.')
  })

  it('passes item categories and text in the prompt', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Summary.' }],
    })

    await generateNarrativeSummary(items)

    const call = mockCreate.mock.calls[0][0]
    const userContent = call.messages[0].content as string
    expect(userContent).toContain('Platform')
    expect(userContent).toContain('Unity Catalog update')
    expect(userContent).toContain('Runtime')
    expect(userContent).toContain('DBR 15.4 LTS released')
  })

  it('uses claude-sonnet-4-6 model', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Summary.' }],
    })

    await generateNarrativeSummary(items)
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-sonnet-4-6')
  })
})
