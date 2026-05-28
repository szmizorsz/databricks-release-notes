import * as cheerio from 'cheerio'
import type { ScrapedItem } from './types'

const SOURCES = [
  { url: 'https://docs.databricks.com/release-notes/product/', category: 'Platform' },
  { url: 'https://docs.databricks.com/release-notes/runtime/', category: 'Runtime' },
  { url: 'https://docs.databricks.com/sql/release-notes/', category: 'SQL' },
]

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

async function scrapePage(url: string, category: string, targetDates: string[]): Promise<ScrapedItem[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DatabricksDigestBot/1.0)' },
    })
    if (!res.ok) return []

    const $ = cheerio.load(await res.text())
    const items: ScrapedItem[] = []

    $('h2').each((_, el) => {
      if (!targetDates.includes($(el).text().trim())) return

      let node = $(el).next()
      while (node.length && !node.is('h2')) {
        if (node.is('ul')) {
          node.find('li').each((_, li) => {
            const text = $(li).text().trim()
            if (text) items.push({ category, text, sourceUrl: url })
          })
        }
        node = node.next()
      }
    })

    return items
  } catch {
    return []
  }
}

export async function scrapeReleaseNotes(date: Date): Promise<ScrapedItem[]> {
  const yesterday = new Date(date)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)

  const targetDates = [formatDateLabel(date), formatDateLabel(yesterday)]
  const results = await Promise.all(
    SOURCES.map(({ url, category }) => scrapePage(url, category, targetDates))
  )
  return results.flat()
}
