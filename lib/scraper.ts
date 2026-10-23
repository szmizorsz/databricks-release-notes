import * as cheerio from 'cheerio'
import type { ScrapedItem } from './types'

const RSS_URL = 'https://docs.databricks.com/aws/en/feed.xml'
const BLOG_RSS_URL = 'https://www.databricks.com/feed'

// Blog categories that mark product announcements (vs. customer stories, research, etc.)
const BLOG_PRODUCT_CATEGORIES = new Set(['Platform & Products & Announcements', 'Platform'])
const BLOG_CATEGORY = 'Databricks Blog'

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type ItemReader = {
  field: (name: string) => string
  categories: () => string[]
}

// Fetches an RSS feed and maps its items published today or yesterday (UTC); `map` returns null to skip an item
async function scrapeRecentItems(
  url: string,
  date: Date,
  map: (item: ItemReader) => ScrapedItem | null,
): Promise<ScrapedItem[]> {
  const yesterday = new Date(date)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DatabricksDigestBot/1.0)' },
    })
    if (!res.ok) return []

    const $ = cheerio.load(await res.text(), { xmlMode: true })
    const items: ScrapedItem[] = []

    $('item').each((_, el) => {
      const field = (name: string) => $(el).children(name).text().trim()
      const pubDateStr = field('pubDate')
      if (!pubDateStr) return

      const pubDate = new Date(pubDateStr)
      if (!isSameUTCDate(pubDate, date) && !isSameUTCDate(pubDate, yesterday)) return

      const categories = () => $(el).children('category').map((_, cat) => $(cat).text().trim()).get()
      const item = map({ field, categories })
      if (item) items.push(item)
    })

    return items
  } catch {
    return []
  }
}

export function scrapeReleaseNotes(date: Date): Promise<ScrapedItem[]> {
  return scrapeRecentItems(RSS_URL, date, ({ field, categories }) => {
    const title = field('title')
    if (!title) return null

    const sourceUrl = field('guid') || field('link')
    const rawDescription = field('description')
    const category = pickCategory(categories())

    // Plain text for Claude (strip HTML tags)
    const descriptionText = stripHtml(rawDescription)
    const text = descriptionText ? `${title} — ${descriptionText}` : title
    // HTML for email (preserve bullet lists, bold, etc. from RSS)
    const descriptionHtml = rawDescription

    return { category, text, descriptionHtml, sourceUrl }
  })
}

export function scrapeBlog(date: Date): Promise<ScrapedItem[]> {
  return scrapeRecentItems(BLOG_RSS_URL, date, ({ field, categories }) => {
    if (!categories().some(c => BLOG_PRODUCT_CATEGORIES.has(c))) return null

    const title = field('title')
    if (!title) return null

    // Blog descriptions are short plain-text teasers
    const teaser = field('description')
    const text = teaser ? `${title} — ${teaser}` : title

    return { category: BLOG_CATEGORY, text, descriptionHtml: escapeHtml(teaser), sourceUrl: field('link') }
  })
}
