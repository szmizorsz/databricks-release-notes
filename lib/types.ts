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
  text: string
  sourceUrl: string
}
