import { Resend } from 'resend'
import type { ScrapedItem } from './types'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function buildHtml(date: Date, items: ScrapedItem[], narrative: string): string {
  const grouped = items.reduce<Record<string, ScrapedItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  const section1 = Object.entries(grouped)
    .map(([cat, catItems]) => `
      <h3 style="color:#1a56db;font-size:14px;margin:16px 0 6px">${escapeHtml(cat)}</h3>
      <ul style="margin:0;padding-left:20px">
        ${catItems.map(i => `<li style="margin:4px 0;color:#374151">${escapeHtml(i.text)}</li>`).join('')}
      </ul>`)
    .join('')

  const sourceUrls = [...new Set(items.map(i => i.sourceUrl))]
  const section3 = sourceUrls
    .map(url => `<li><a href="${url}" style="color:#1a56db">${url}</a></li>`)
    .join('')

  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827">
  <h1 style="font-size:20px;margin-bottom:4px">Databricks Release Notes</h1>
  <p style="color:#6b7280;margin-top:0">${formatDate(date)}</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
  <h2 style="font-size:16px">Structured Summary</h2>
  ${section1}

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
  <h2 style="font-size:16px">AI Narrative Summary</h2>
  <p style="line-height:1.6;color:#374151">${escapeHtml(narrative)}</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
  <h2 style="font-size:16px">Source Pages</h2>
  <ul style="padding-left:20px">${section3}</ul>
</body>
</html>`
}

export async function sendDigestEmail(
  to: string,
  date: Date,
  items: ScrapedItem[],
  narrative: string
): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'Databricks Digest <digest@resend.dev>',
    to,
    subject: `Databricks Release Notes — ${formatDate(date)}`,
    html: buildHtml(date, items, narrative),
  })
  if (error) throw new Error(`Failed to send email: ${error.message}`)
}
