export interface Config {
  email: string
}

export interface RunEntry {
  id: string
  timestamp: string  // ISO 8601
  status: 'success' | 'skipped' | 'error'
  itemCount?: number
  error?: string
}

export interface ScrapedItem {
  category: string
  text: string          // plain text for Claude summarizer (title + stripped description)
  descriptionHtml: string  // original HTML from RSS for email rendering
  sourceUrl: string
}
