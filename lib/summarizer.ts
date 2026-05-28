import Anthropic from '@anthropic-ai/sdk'
import type { ScrapedItem } from './types'

const SYSTEM_PROMPT = `You are a technical writer summarizing Databricks platform release notes for a software engineer.
Write a concise narrative summary (150-250 words) of the provided release notes.
Highlight the most impactful changes. Call out anything requiring action: upgrades, deprecations, breaking changes.
Write in plain prose, not bullet points. Be specific and technical.`

export async function generateNarrativeSummary(items: ScrapedItem[]): Promise<string> {
  const client = new Anthropic()

  const grouped = items.reduce<Record<string, string[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item.text)
    return acc
  }, {})

  const content = Object.entries(grouped)
    .map(([cat, texts]) => `${cat}:\n${texts.map(t => `- ${t}`).join('\n')}`)
    .join('\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude')
  return block.text
}
