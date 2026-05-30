import * as cheerio from 'cheerio'
import type { ScrapedItem } from './types'

const RSS_URL = 'https://docs.databricks.com/aws/en/feed.xml'

// Tags that are meta/workflow labels, not meaningful categories
const SKIP_CATEGORIES = new Set(['whatscoming'])
// Generic categories — prefer more specific ones when available
const GENERIC_CATEGORIES = new Set(['Product', 'Security', 'Identity'])

function isSameUTCDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function pickCategory(categories: string[]): string {
  const filtered = categories.filter(c => !SKIP_CATEGORIES.has(c))
  const specific = filtered.find(c => !GENERIC_CATEGORIES.has(c))
  return specific ?? 'Platform'
}

export async function scrapeReleaseNotes(date: Date): Promise<ScrapedItem[]> {
  const yesterday = new Date(date)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)

  try {
    const res = await fetch(RSS_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DatabricksDigestBot/1.0)' },
    })
    if (!res.ok) return []

    const $ = cheerio.load(await res.text(), { xmlMode: true })
    const items: ScrapedItem[] = []

    $('item').each((_, el) => {
      const pubDateStr = $(el).children('pubDate').text().trim()
      if (!pubDateStr) return

      const pubDate = new Date(pubDateStr)
      if (!isSameUTCDate(pubDate, date) && !isSameUTCDate(pubDate, yesterday)) return

      const title = $(el).children('title').text().trim()
      const sourceUrl = $(el).children('guid').text().trim() || $(el).children('link').text().trim()
      const rawDescription = $(el).children('description').text()
      const description = stripHtml(rawDescription)
      const categories = $(el).children('category').map((_, cat) => $(cat).text().trim()).get()
      const category = pickCategory(categories)

      const text = description ? `${title} — ${description}` : title
      if (title) items.push({ category, text, sourceUrl })
    })

    return items
  } catch {
    return []
  }
}
