import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scrapeReleaseNotes } from '@/lib/scraper'

const PLATFORM_URL = 'https://docs.databricks.com/release-notes/product/'
const RUNTIME_URL = 'https://docs.databricks.com/release-notes/runtime/'
const SQL_URL = 'https://docs.databricks.com/sql/release-notes/'

function makeHtml(dateLabel: string, items: string[]): string {
  return `<html><body><article>
    <h2>${dateLabel}</h2>
    <ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>
    <h2>April 1, 2026</h2>
    <ul><li>Old item</li></ul>
  </article></body></html>`
}

function stubFetch(htmlByUrl: Record<string, string>) {
  vi.stubGlobal('fetch', vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      text: () => Promise.resolve(htmlByUrl[url] ?? '<html><body></body></html>'),
    })
  ))
}

beforeEach(() => vi.unstubAllGlobals())

describe('scrapeReleaseNotes', () => {
  it('returns items from today\'s date section', async () => {
    stubFetch({
      [PLATFORM_URL]: makeHtml('May 28, 2026', ['Feature A', 'Feature B']),
      [RUNTIME_URL]: makeHtml('May 28, 2026', ['Runtime update']),
      [SQL_URL]: '<html><body></body></html>',
    })

    const items = await scrapeReleaseNotes(new Date('2026-05-28T12:00:00Z'))

    expect(items).toHaveLength(3)
    expect(items[0]).toEqual({ category: 'Platform', text: 'Feature A', sourceUrl: PLATFORM_URL })
    expect(items[1]).toEqual({ category: 'Platform', text: 'Feature B', sourceUrl: PLATFORM_URL })
    expect(items[2]).toEqual({ category: 'Runtime', text: 'Runtime update', sourceUrl: RUNTIME_URL })
  })

  it('returns empty array when no matching date sections', async () => {
    stubFetch({
      [PLATFORM_URL]: makeHtml('May 1, 2026', ['Old item']),
      [RUNTIME_URL]: makeHtml('May 1, 2026', ['Old runtime']),
      [SQL_URL]: makeHtml('May 1, 2026', ['Old sql']),
    })

    expect(await scrapeReleaseNotes(new Date('2026-05-28T12:00:00Z'))).toHaveLength(0)
  })

  it('includes yesterday\'s items for timezone edge cases', async () => {
    stubFetch({
      [PLATFORM_URL]: makeHtml('May 27, 2026', ['Yesterday item']),
      [RUNTIME_URL]: '<html><body></body></html>',
      [SQL_URL]: '<html><body></body></html>',
    })

    const items = await scrapeReleaseNotes(new Date('2026-05-28T12:00:00Z'))
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe('Yesterday item')
  })

  it('skips pages that return non-200', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === PLATFORM_URL) return Promise.resolve({ ok: false, text: () => Promise.resolve('') })
      if (url === RUNTIME_URL) return Promise.resolve({ ok: true, text: () => Promise.resolve(makeHtml('May 28, 2026', ['Runtime item'])) })
      return Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body></body></html>') })
    }))

    const items = await scrapeReleaseNotes(new Date('2026-05-28T12:00:00Z'))
    expect(items).toHaveLength(1)
    expect(items[0].category).toBe('Runtime')
  })
})
