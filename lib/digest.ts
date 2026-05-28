import { v4 as uuidv4 } from 'uuid'
import { scrapeReleaseNotes } from './scraper'
import { generateNarrativeSummary } from './summarizer'
import { sendDigestEmail } from './emailer'
import { getConfig, appendRun } from './kv'
import type { RunEntry } from './types'

export async function runDigest(): Promise<RunEntry> {
  const now = new Date()
  const id = uuidv4()

  const config = await getConfig()
  if (!config?.email) {
    const run: RunEntry = { id, timestamp: now.toISOString(), status: 'error', error: 'No target email configured' }
    await appendRun(run)
    return run
  }

  try {
    const items = await scrapeReleaseNotes(now)

    if (items.length === 0) {
      const run: RunEntry = { id, timestamp: now.toISOString(), status: 'skipped', itemCount: 0 }
      await appendRun(run)
      return run
    }

    const narrative = await generateNarrativeSummary(items)
    await sendDigestEmail(config.email, now, items, narrative)

    const run: RunEntry = { id, timestamp: now.toISOString(), status: 'success', itemCount: items.length }
    await appendRun(run)
    return run
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    const run: RunEntry = { id, timestamp: now.toISOString(), status: 'error', error }
    await appendRun(run)
    return run
  }
}
