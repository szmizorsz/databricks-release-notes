import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scrapeReleaseNotes } from '@/lib/scraper'

function makeRss(items: { title: string; pubDate: string; description: string; categories: string[]; guid: string }[]): string {
  const itemsXml = items.map(item => `
    <item>
      <title>${item.title}</title>
      <guid>${item.guid}</guid>
      <pubDate>${item.pubDate}</pubDate>
      <description><![CDATA[<p>${item.description}</p>]]></description>
      ${item.categories.map(c => `<category>${c}</category>`).join('')}
    </item>
  `).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Databricks Release Notes</title>
    <link>https://docs.databricks.com/aws/en/release-notes/</link>
    ${itemsXml}
  </channel>
</rss>`
}

function stubFetch(rssXml: string, ok = true) {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({ ok, text: () => Promise.resolve(rssXml) })
  ))
}

beforeEach(() => vi.unstubAllGlobals())

describe('scrapeReleaseNotes', () => {
  it('returns items matching today\'s date', async () => {
    stubFetch(makeRss([
      { title: 'Feature A', pubDate: 'Thu, 28 May 2026 00:00:00 GMT', description: 'Desc A', categories: ['Product', 'Databricks Apps'], guid: 'https://docs.databricks.com/aws/en/release-notes/product/2026/may#a' },
      { title: 'Feature B', pubDate: 'Thu, 28 May 2026 00:00:00 GMT', description: 'Desc B', categories: ['Databricks Runtime'], guid: 'https://docs.databricks.com/aws/en/release-notes/runtime/18#b' },
      { title: 'Old Feature', pubDate: 'Wed, 01 Apr 2026 00:00:00 GMT', description: 'Old', categories: ['Product'], guid: 'https://docs.databricks.com/aws/en/old' },
    ]))

    const items = await scrapeReleaseNotes(new Date('2026-05-28T12:00:00Z'))

    expect(items).toHaveLength(2)
    expect(items[0].category).toBe('Databricks Apps')
    expect(items[0].text).toContain('Feature A')
    expect(items[0].text).toContain('Desc A')
    expect(items[0].descriptionHtml).toContain('Desc A')
    expect(items[0].sourceUrl).toBe('https://docs.databricks.com/aws/en/release-notes/product/2026/may#a')
    expect(items[1].category).toBe('Databricks Runtime')
  })

  it('returns empty array when no items match today or yesterday', async () => {
    stubFetch(makeRss([
      { title: 'Old Feature', pubDate: 'Wed, 01 Apr 2026 00:00:00 GMT', description: 'Old', categories: ['Product'], guid: 'https://docs.databricks.com/aws/en/old' },
    ]))

    expect(await scrapeReleaseNotes(new Date('2026-05-28T12:00:00Z'))).toHaveLength(0)
  })

  it('includes yesterday\'s items for timezone edge cases', async () => {
    stubFetch(makeRss([
      { title: 'Yesterday Feature', pubDate: 'Wed, 27 May 2026 00:00:00 GMT', description: 'Yesterday desc', categories: ['Product', 'Unity Catalog'], guid: 'https://docs.databricks.com/aws/en/yesterday' },
    ]))

    const items = await scrapeReleaseNotes(new Date('2026-05-28T12:00:00Z'))
    expect(items).toHaveLength(1)
    expect(items[0].text).toContain('Yesterday Feature')
    expect(items[0].category).toBe('Unity Catalog')
  })

  it('returns empty array when fetch returns non-200', async () => {
    stubFetch('', false)
    expect(await scrapeReleaseNotes(new Date('2026-05-28T12:00:00Z'))).toHaveLength(0)
  })

  it('returns empty array when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network failure'))))
    expect(await scrapeReleaseNotes(new Date('2026-05-28T12:00:00Z'))).toHaveLength(0)
  })

  it('falls back to Platform when only generic categories present', async () => {
    stubFetch(makeRss([
      { title: 'Generic update', pubDate: 'Thu, 28 May 2026 00:00:00 GMT', description: 'Details', categories: ['Product', 'Security'], guid: 'https://docs.databricks.com/aws/en/generic' },
    ]))

    const items = await scrapeReleaseNotes(new Date('2026-05-28T12:00:00Z'))
    expect(items).toHaveLength(1)
    expect(items[0].category).toBe('Platform')
  })

  it('excludes whatscoming tag from category selection', async () => {
    stubFetch(makeRss([
      { title: 'Upcoming change', pubDate: 'Thu, 28 May 2026 00:00:00 GMT', description: 'Coming soon', categories: ['Product', 'whatscoming', 'Databricks Apps'], guid: 'https://docs.databricks.com/aws/en/upcoming' },
    ]))

    const items = await scrapeReleaseNotes(new Date('2026-05-28T12:00:00Z'))
    expect(items).toHaveLength(1)
    expect(items[0].category).toBe('Databricks Apps')
  })
})
