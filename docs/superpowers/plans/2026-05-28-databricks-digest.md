# Databricks Release Notes Digest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js 15 app that scrapes Databricks release notes daily, generates a 3-section email digest (structured summary + Claude narrative + source links) via Resend, with an admin UI for config and run history, triggered by GitHub Actions cron.

**Architecture:** Next.js 15 App Router on Vercel. Vercel KV (Redis, via Upstash) stores email config and run history. Cheerio parses the Databricks RSS feed. GitHub Actions cron hits a Bearer-token-protected API route. Server Actions handle admin UI mutations server-side without exposing secrets to the browser.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Cheerio, `@anthropic-ai/sdk` (claude-sonnet-4-6), Resend, `@vercel/kv`, Vitest

---

## Post-Implementation Amendments (2026-05-30)

The following changes were made after initial implementation based on real-world findings:

**1. Scraper: HTML scraping → RSS feed**
Databricks restructured their docs site. The original three HTML page URLs are outdated. The scraper now uses the unified RSS feed at `https://docs.databricks.com/aws/en/feed.xml`, which is more reliable and structured. Task 5 code no longer applies — see current `lib/scraper.ts`.

**2. `ScrapedItem` type: added `descriptionHtml` field**
RSS items carry rich HTML descriptions (bullet lists, bold feature names). Stripping this to plain text for the email lost all formatting. `ScrapedItem` now has two content fields:
- `text` — plain text (`title — stripped description`), used by the Claude summarizer
- `descriptionHtml` — raw HTML from the RSS `<description>` CDATA, rendered directly in email section 1

**3. Email section 1: plain `<li>` list → HTML from RSS**
Each item now renders its title (bold) plus its original `descriptionHtml` block, preserving bullet lists and formatting exactly as published by Databricks.

**4. Sender address: hardcoded `onboarding@resend.dev`**
Resend does not allow sending from free public domains (Gmail). Custom domain verification requires owning a domain. For this personal tool, `onboarding@resend.dev` (Resend's shared sender) is hardcoded in `lib/emailer.ts`. The `EMAIL_FROM` env var is no longer used.

**5. Vercel KV: uses Upstash directly**
`KV_REST_API_URL` and `KV_REST_API_TOKEN` are populated from Upstash (via Vercel Marketplace), not Vercel's native KV (deprecated).

---

---

## File Map

| File | Responsibility |
|---|---|
| `lib/types.ts` | Shared TypeScript interfaces |
| `lib/kv.ts` | Vercel KV read/write (config + run history) |
| `lib/auth.ts` | Bearer token validation helper |
| `lib/scraper.ts` | Fetch + parse Databricks release note pages with Cheerio |
| `lib/summarizer.ts` | Claude API — generate narrative digest |
| `lib/emailer.ts` | Build HTML email + send via Resend |
| `lib/digest.ts` | Orchestrate full job: scrape → summarize → email → log |
| `app/api/digest/route.ts` | `POST /api/digest` — GitHub Actions trigger |
| `app/api/config/route.ts` | `GET/PUT /api/config` — email config |
| `app/api/runs/route.ts` | `GET /api/runs` — run history |
| `app/actions.ts` | Server Actions for admin UI (trigger, save config) |
| `app/page.tsx` | Admin page (Server Component) |
| `app/components/ConfigForm.tsx` | Email config form (Client Component) |
| `app/components/ManualRunButton.tsx` | Trigger manual run (Client Component) |
| `app/components/RunHistory.tsx` | Run history table (Client Component) |
| `app/layout.tsx` | Root layout |
| `.github/workflows/digest.yml` | Daily cron trigger |
| `vitest.config.ts` | Vitest configuration |
| `vitest.setup.ts` | Vitest setup file |
| `__tests__/kv.test.ts` | KV helper tests |
| `__tests__/scraper.test.ts` | Scraper tests |
| `__tests__/summarizer.test.ts` | Summarizer tests |
| `__tests__/emailer.test.ts` | Emailer tests |
| `__tests__/digest.test.ts` | Orchestrator tests |
| `__tests__/api.test.ts` | API route tests |

---

### Task 1: Project Bootstrap

**Files:**
- Create: entire project via `create-next-app`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `.env.local`
- Create: `.env.example`

- [ ] **Step 1: Scaffold Next.js 15 project**

Run from the parent directory (`/Users/szabolcsszentes`):
```bash
npx create-next-app@latest databricks-release-notes \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*"
cd databricks-release-notes
```

- [ ] **Step 2: Install runtime and dev dependencies**

```bash
npm install cheerio @anthropic-ai/sdk resend @vercel/kv uuid
npm install --save-dev vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @types/uuid jsdom
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

Create `vitest.setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

Add to `package.json` scripts (merge with existing scripts):
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create environment files**

Create `.env.example`:
```
DIGEST_SECRET=your-secret-here
ANTHROPIC_API_KEY=your-anthropic-key
RESEND_API_KEY=your-resend-key
KV_REST_API_URL=your-vercel-kv-url
KV_REST_API_TOKEN=your-vercel-kv-token
```

Create `.env.local` (already gitignored by Next.js):
```
DIGEST_SECRET=dev-secret-change-me
ANTHROPIC_API_KEY=
RESEND_API_KEY=
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

Add `.superpowers/` to `.gitignore` (append to the file `create-next-app` generated):
```
.superpowers/
```

- [ ] **Step 5: Verify project builds**

```bash
npm run build
```
Expected: Build succeeds. No TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: bootstrap Next.js 15 project with Vitest"
```

---

### Task 2: Shared Types

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Write types**

Create `lib/types.ts`:
```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

### Task 3: Vercel KV Helpers

**Files:**
- Create: `lib/kv.ts`
- Create: `__tests__/kv.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/kv.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

import { kv } from '@vercel/kv'
import { getConfig, setConfig, getRuns, appendRun } from '@/lib/kv'
import type { Config, RunEntry } from '@/lib/types'

const mockGet = vi.mocked(kv.get)
const mockSet = vi.mocked(kv.set)

beforeEach(() => vi.clearAllMocks())

describe('getConfig', () => {
  it('returns stored config', async () => {
    mockGet.mockResolvedValueOnce({ email: 'test@example.com' } as Config)
    expect(await getConfig()).toEqual({ email: 'test@example.com' })
    expect(mockGet).toHaveBeenCalledWith('config')
  })

  it('returns null when nothing stored', async () => {
    mockGet.mockResolvedValueOnce(null)
    expect(await getConfig()).toBeNull()
  })
})

describe('setConfig', () => {
  it('writes config to KV', async () => {
    mockSet.mockResolvedValueOnce('OK' as never)
    await setConfig({ email: 'user@example.com' })
    expect(mockSet).toHaveBeenCalledWith('config', { email: 'user@example.com' })
  })
})

describe('getRuns', () => {
  it('returns stored runs', async () => {
    const runs: RunEntry[] = [
      { id: '1', timestamp: '2026-05-28T08:00:00Z', status: 'success', itemCount: 5 },
    ]
    mockGet.mockResolvedValueOnce(runs)
    expect(await getRuns()).toEqual(runs)
  })

  it('returns empty array when nothing stored', async () => {
    mockGet.mockResolvedValueOnce(null)
    expect(await getRuns()).toEqual([])
  })
})

describe('appendRun', () => {
  it('prepends new run and caps at 30 entries', async () => {
    const existing: RunEntry[] = Array.from({ length: 30 }, (_, i) => ({
      id: `${i}`,
      timestamp: '2026-05-01T08:00:00Z',
      status: 'success' as const,
      itemCount: 1,
    }))
    mockGet.mockResolvedValueOnce(existing)
    mockSet.mockResolvedValueOnce('OK' as never)

    const newRun: RunEntry = { id: 'new', timestamp: '2026-05-28T08:00:00Z', status: 'success', itemCount: 7 }
    await appendRun(newRun)

    const saved = mockSet.mock.calls[0][1] as RunEntry[]
    expect(saved).toHaveLength(30)
    expect(saved[0]).toEqual(newRun)
  })

  it('appends to empty list', async () => {
    mockGet.mockResolvedValueOnce(null)
    mockSet.mockResolvedValueOnce('OK' as never)

    const newRun: RunEntry = { id: 'first', timestamp: '2026-05-28T08:00:00Z', status: 'success', itemCount: 3 }
    await appendRun(newRun)

    const saved = mockSet.mock.calls[0][1] as RunEntry[]
    expect(saved).toHaveLength(1)
    expect(saved[0]).toEqual(newRun)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test __tests__/kv.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/kv'"

- [ ] **Step 3: Implement KV helpers**

Create `lib/kv.ts`:
```typescript
import { kv } from '@vercel/kv'
import type { Config, RunEntry } from './types'

const MAX_RUNS = 30

export async function getConfig(): Promise<Config | null> {
  return kv.get<Config>('config')
}

export async function setConfig(config: Config): Promise<void> {
  await kv.set('config', config)
}

export async function getRuns(): Promise<RunEntry[]> {
  const runs = await kv.get<RunEntry[]>('runs')
  return runs ?? []
}

export async function appendRun(run: RunEntry): Promise<void> {
  const existing = await getRuns()
  await kv.set('runs', [run, ...existing].slice(0, MAX_RUNS))
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test __tests__/kv.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/kv.ts __tests__/kv.test.ts
git commit -m "feat: add Vercel KV helpers with tests"
```

---

### Task 4: Auth Helper

**Files:**
- Create: `lib/auth.ts`

- [ ] **Step 1: Implement auth helper**

Create `lib/auth.ts`:
```typescript
export function isAuthorized(req: Request): boolean {
  const header = req.headers.get('Authorization')
  const secret = process.env.DIGEST_SECRET
  if (!secret) return false
  return header === `Bearer ${secret}`
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/auth.ts
git commit -m "feat: add Bearer token auth helper"
```

---

### Task 5: Scraper

**Files:**
- Create: `lib/scraper.ts`
- Create: `__tests__/scraper.test.ts`

> **Before implementing:** Open `https://docs.databricks.com/release-notes/product/` in a browser and inspect the HTML. The selectors below target `<h2>` date headings followed by `<ul>` lists — adjust if the actual markup differs.

- [ ] **Step 1: Write failing tests**

Create `__tests__/scraper.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test __tests__/scraper.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/scraper'"

- [ ] **Step 3: Implement scraper**

Create `lib/scraper.ts`:
```typescript
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test __tests__/scraper.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/scraper.ts __tests__/scraper.test.ts
git commit -m "feat: add Databricks release notes scraper with Cheerio"
```

---

### Task 6: Summarizer

**Files:**
- Create: `lib/summarizer.ts`
- Create: `__tests__/summarizer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/summarizer.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

import { generateNarrativeSummary } from '@/lib/summarizer'
import type { ScrapedItem } from '@/lib/types'

beforeEach(() => vi.clearAllMocks())

const items: ScrapedItem[] = [
  { category: 'Platform', text: 'Unity Catalog update', sourceUrl: 'https://docs.databricks.com/release-notes/product/' },
  { category: 'Runtime', text: 'DBR 15.4 LTS released', sourceUrl: 'https://docs.databricks.com/release-notes/runtime/' },
]

describe('generateNarrativeSummary', () => {
  it('returns text from Claude response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Today Databricks released several important updates.' }],
    })

    const result = await generateNarrativeSummary(items)
    expect(result).toBe('Today Databricks released several important updates.')
  })

  it('passes item categories and text in the prompt', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Summary.' }],
    })

    await generateNarrativeSummary(items)

    const call = mockCreate.mock.calls[0][0]
    const userContent = call.messages[0].content as string
    expect(userContent).toContain('Platform')
    expect(userContent).toContain('Unity Catalog update')
    expect(userContent).toContain('Runtime')
    expect(userContent).toContain('DBR 15.4 LTS released')
  })

  it('uses claude-sonnet-4-6 model', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Summary.' }],
    })

    await generateNarrativeSummary(items)
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-sonnet-4-6')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test __tests__/summarizer.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/summarizer'"

- [ ] **Step 3: Implement summarizer**

Create `lib/summarizer.ts`:
```typescript
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test __tests__/summarizer.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/summarizer.ts __tests__/summarizer.test.ts
git commit -m "feat: add Claude narrative summarizer"
```

---

### Task 7: Emailer

**Files:**
- Create: `lib/emailer.ts`
- Create: `__tests__/emailer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/emailer.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

import { sendDigestEmail } from '@/lib/emailer'
import type { ScrapedItem } from '@/lib/types'

beforeEach(() => {
  vi.clearAllMocks()
  mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null })
})

const items: ScrapedItem[] = [
  { category: 'Platform', text: 'Unity Catalog update', sourceUrl: 'https://docs.databricks.com/release-notes/product/' },
  { category: 'Runtime', text: 'DBR 15.4 released', sourceUrl: 'https://docs.databricks.com/release-notes/runtime/' },
  { category: 'SQL', text: 'AI Functions update', sourceUrl: 'https://docs.databricks.com/sql/release-notes/' },
]

describe('sendDigestEmail', () => {
  it('sends to the specified address', async () => {
    await sendDigestEmail('user@example.com', new Date('2026-05-28T12:00:00Z'), items, 'Narrative text.')
    expect(mockSend.mock.calls[0][0].to).toBe('user@example.com')
  })

  it('includes formatted date in subject', async () => {
    await sendDigestEmail('user@example.com', new Date('2026-05-28T12:00:00Z'), items, 'Narrative.')
    expect(mockSend.mock.calls[0][0].subject).toContain('May 28, 2026')
  })

  it('includes section 1 bullet items in HTML body', async () => {
    await sendDigestEmail('user@example.com', new Date('2026-05-28T12:00:00Z'), items, 'Narrative.')
    const html = mockSend.mock.calls[0][0].html as string
    expect(html).toContain('Unity Catalog update')
    expect(html).toContain('DBR 15.4 released')
  })

  it('includes section 2 narrative in HTML body', async () => {
    await sendDigestEmail('user@example.com', new Date('2026-05-28T12:00:00Z'), items, 'The narrative text here.')
    expect(mockSend.mock.calls[0][0].html).toContain('The narrative text here.')
  })

  it('includes section 3 source URLs in HTML body', async () => {
    await sendDigestEmail('user@example.com', new Date('2026-05-28T12:00:00Z'), items, 'Narrative.')
    const html = mockSend.mock.calls[0][0].html as string
    expect(html).toContain('docs.databricks.com/release-notes/product/')
    expect(html).toContain('docs.databricks.com/release-notes/runtime/')
    expect(html).toContain('docs.databricks.com/sql/release-notes/')
  })

  it('groups items by category in section 1', async () => {
    await sendDigestEmail('user@example.com', new Date('2026-05-28T12:00:00Z'), items, 'Narrative.')
    const html = mockSend.mock.calls[0][0].html as string
    expect(html).toContain('Platform')
    expect(html).toContain('Runtime')
    expect(html).toContain('SQL')
  })

  it('throws when Resend returns an error', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'API error' } })
    await expect(
      sendDigestEmail('user@example.com', new Date('2026-05-28T12:00:00Z'), items, 'Narrative.')
    ).rejects.toThrow('Failed to send email: API error')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test __tests__/emailer.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/emailer'"

- [ ] **Step 3: Implement emailer**

Create `lib/emailer.ts`:
```typescript
import { Resend } from 'resend'
import type { ScrapedItem } from './types'

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
      <h3 style="color:#1a56db;font-size:14px;margin:16px 0 6px">${cat}</h3>
      <ul style="margin:0;padding-left:20px">
        ${catItems.map(i => `<li style="margin:4px 0;color:#374151">${i.text}</li>`).join('')}
      </ul>`)
    .join('')

  const sourceUrls = [...new Set(items.map(i => i.sourceUrl))]
  const section3 = sourceUrls
    .map(url => `<li><a href="https://${url}" style="color:#1a56db">${url}</a></li>`)
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
  <p style="line-height:1.6;color:#374151">${narrative}</p>

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
    from: 'Databricks Digest <digest@resend.dev>',
    to,
    subject: `Databricks Release Notes — ${formatDate(date)}`,
    html: buildHtml(date, items, narrative),
  })
  if (error) throw new Error(`Failed to send email: ${error.message}`)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test __tests__/emailer.test.ts
```
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/emailer.ts __tests__/emailer.test.ts
git commit -m "feat: add HTML email builder and Resend sender"
```

---

### Task 8: Digest Orchestrator

**Files:**
- Create: `lib/digest.ts`
- Create: `__tests__/digest.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/digest.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/scraper', () => ({ scrapeReleaseNotes: vi.fn() }))
vi.mock('@/lib/summarizer', () => ({ generateNarrativeSummary: vi.fn() }))
vi.mock('@/lib/emailer', () => ({ sendDigestEmail: vi.fn() }))
vi.mock('@/lib/kv', () => ({ getConfig: vi.fn(), appendRun: vi.fn() }))

import { scrapeReleaseNotes } from '@/lib/scraper'
import { generateNarrativeSummary } from '@/lib/summarizer'
import { sendDigestEmail } from '@/lib/emailer'
import { getConfig, appendRun } from '@/lib/kv'
import { runDigest } from '@/lib/digest'

const mockScrape = vi.mocked(scrapeReleaseNotes)
const mockSummarize = vi.mocked(generateNarrativeSummary)
const mockEmail = vi.mocked(sendDigestEmail)
const mockGetConfig = vi.mocked(getConfig)
const mockAppendRun = vi.mocked(appendRun)

beforeEach(() => {
  vi.clearAllMocks()
  mockAppendRun.mockResolvedValue(undefined)
})

describe('runDigest', () => {
  it('returns error when no email configured', async () => {
    mockGetConfig.mockResolvedValueOnce(null)

    const result = await runDigest()

    expect(result.status).toBe('error')
    expect(result.error).toContain('No target email configured')
    expect(mockAppendRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }))
    expect(mockEmail).not.toHaveBeenCalled()
  })

  it('returns skipped when no items scraped', async () => {
    mockGetConfig.mockResolvedValueOnce({ email: 'user@example.com' })
    mockScrape.mockResolvedValueOnce([])

    const result = await runDigest()

    expect(result.status).toBe('skipped')
    expect(result.itemCount).toBe(0)
    expect(mockEmail).not.toHaveBeenCalled()
    expect(mockAppendRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }))
  })

  it('scrapes, summarizes, emails, and logs on success', async () => {
    const items = [{ category: 'Platform', text: 'Feature A', sourceUrl: 'https://docs.databricks.com/release-notes/product/' }]
    mockGetConfig.mockResolvedValueOnce({ email: 'user@example.com' })
    mockScrape.mockResolvedValueOnce(items)
    mockSummarize.mockResolvedValueOnce('Great summary.')
    mockEmail.mockResolvedValueOnce(undefined)

    const result = await runDigest()

    expect(result.status).toBe('success')
    expect(result.itemCount).toBe(1)
    expect(mockSummarize).toHaveBeenCalledWith(items)
    expect(mockEmail).toHaveBeenCalledWith('user@example.com', expect.any(Date), items, 'Great summary.')
    expect(mockAppendRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', itemCount: 1 }))
  })

  it('returns error when scrape throws', async () => {
    mockGetConfig.mockResolvedValueOnce({ email: 'user@example.com' })
    mockScrape.mockRejectedValueOnce(new Error('Network error'))

    const result = await runDigest()

    expect(result.status).toBe('error')
    expect(result.error).toContain('Network error')
    expect(mockAppendRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }))
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test __tests__/digest.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/digest'"

- [ ] **Step 3: Implement orchestrator**

Create `lib/digest.ts`:
```typescript
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test __tests__/digest.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```
Expected: All tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add lib/digest.ts __tests__/digest.test.ts
git commit -m "feat: add digest orchestrator"
```

---

### Task 9: API Routes

**Files:**
- Create: `app/api/digest/route.ts`
- Create: `app/api/config/route.ts`
- Create: `app/api/runs/route.ts`
- Create: `__tests__/api.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/digest', () => ({ runDigest: vi.fn() }))
vi.mock('@/lib/kv', () => ({
  getConfig: vi.fn(),
  setConfig: vi.fn(),
  getRuns: vi.fn(),
}))

process.env.DIGEST_SECRET = 'test-secret'

import { POST as digestPost } from '@/app/api/digest/route'
import { GET as configGet, PUT as configPut } from '@/app/api/config/route'
import { GET as runsGet } from '@/app/api/runs/route'
import { runDigest } from '@/lib/digest'
import { getConfig, setConfig, getRuns } from '@/lib/kv'

const mockRunDigest = vi.mocked(runDigest)
const mockGetConfig = vi.mocked(getConfig)
const mockSetConfig = vi.mocked(setConfig)
const mockGetRuns = vi.mocked(getRuns)

function authedRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost', {
    method,
    headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
}

function unauthRequest(method: string): Request {
  return new Request('http://localhost', { method })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/digest', () => {
  it('returns 401 without token', async () => {
    expect((await digestPost(unauthRequest('POST'))).status).toBe(401)
  })

  it('runs digest and returns result', async () => {
    mockRunDigest.mockResolvedValueOnce({ id: 'abc', timestamp: '2026-05-28T08:00:00Z', status: 'success', itemCount: 5 })
    const res = await digestPost(authedRequest('POST'))
    expect(res.status).toBe(200)
    expect((await res.json()).itemCount).toBe(5)
  })
})

describe('GET /api/config', () => {
  it('returns 401 without token', async () => {
    expect((await configGet(unauthRequest('GET'))).status).toBe(401)
  })

  it('returns current config', async () => {
    mockGetConfig.mockResolvedValueOnce({ email: 'user@example.com' })
    const res = await configGet(authedRequest('GET'))
    expect(res.status).toBe(200)
    expect((await res.json()).email).toBe('user@example.com')
  })

  it('returns empty object when no config set', async () => {
    mockGetConfig.mockResolvedValueOnce(null)
    const res = await configGet(authedRequest('GET'))
    expect(await res.json()).toEqual({})
  })
})

describe('PUT /api/config', () => {
  it('returns 401 without token', async () => {
    expect((await configPut(unauthRequest('PUT'))).status).toBe(401)
  })

  it('saves config and returns 200', async () => {
    mockSetConfig.mockResolvedValueOnce(undefined)
    const res = await configPut(authedRequest('PUT', { email: 'new@example.com' }))
    expect(res.status).toBe(200)
    expect(mockSetConfig).toHaveBeenCalledWith({ email: 'new@example.com' })
  })

  it('returns 400 when email is missing', async () => {
    expect((await configPut(authedRequest('PUT', {}))).status).toBe(400)
  })
})

describe('GET /api/runs', () => {
  it('returns 401 without token', async () => {
    expect((await runsGet(unauthRequest('GET'))).status).toBe(401)
  })

  it('returns run history', async () => {
    const runs = [{ id: '1', timestamp: '2026-05-28T08:00:00Z', status: 'success' as const, itemCount: 3 }]
    mockGetRuns.mockResolvedValueOnce(runs)
    const res = await runsGet(authedRequest('GET'))
    expect(await res.json()).toEqual(runs)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test __tests__/api.test.ts
```
Expected: FAIL — route files don't exist yet.

- [ ] **Step 3: Implement API routes**

Create `app/api/digest/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { isAuthorized } from '@/lib/auth'
import { runDigest } from '@/lib/digest'

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await runDigest()
  return NextResponse.json(result)
}
```

Create `app/api/config/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { isAuthorized } from '@/lib/auth'
import { getConfig, setConfig } from '@/lib/kv'

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const config = await getConfig()
  return NextResponse.json(config ?? {})
}

export async function PUT(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body.email || typeof body.email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }
  await setConfig({ email: body.email })
  return NextResponse.json({ ok: true })
}
```

Create `app/api/runs/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { isAuthorized } from '@/lib/auth'
import { getRuns } from '@/lib/kv'

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await getRuns())
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test __tests__/api.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/ __tests__/api.test.ts
git commit -m "feat: add token-protected API routes for digest, config, and runs"
```

---

### Task 10: Server Actions

**Files:**
- Create: `app/actions.ts`

- [ ] **Step 1: Implement server actions**

Create `app/actions.ts`:
```typescript
'use server'

import { runDigest } from '@/lib/digest'
import { setConfig } from '@/lib/kv'
import type { RunEntry } from '@/lib/types'

export async function triggerDigestAction(): Promise<RunEntry> {
  return runDigest()
}

export async function saveConfigAction(email: string): Promise<void> {
  if (!email || !email.includes('@')) throw new Error('Invalid email address')
  await setConfig({ email })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/actions.ts
git commit -m "feat: add server actions for admin UI"
```

---

### Task 11: Admin UI

**Files:**
- Create: `app/components/ConfigForm.tsx`
- Create: `app/components/ManualRunButton.tsx`
- Create: `app/components/RunHistory.tsx`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Implement ConfigForm**

Create `app/components/ConfigForm.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { saveConfigAction } from '@/app/actions'

export function ConfigForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('saving')
    try {
      await saveConfigAction(email)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed')
      setStatus('error')
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Configuration</h2>
      <form onSubmit={handleSubmit} className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Target email address</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com"
            required
          />
        </div>
        <button
          type="submit"
          disabled={status === 'saving'}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved!' : 'Save'}
        </button>
      </form>
      {status === 'error' && <p className="text-red-500 text-xs mt-2">{errorMsg}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Implement ManualRunButton**

Create `app/components/ManualRunButton.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { triggerDigestAction } from '@/app/actions'
import type { RunEntry } from '@/lib/types'

export function ManualRunButton() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle')
  const [result, setResult] = useState<RunEntry | null>(null)

  async function handleRun() {
    setStatus('running')
    setResult(null)
    const run = await triggerDigestAction()
    setResult(run)
    setStatus('done')
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">Manual Run</p>
        <p className="text-xs text-gray-500 mt-0.5">Trigger a digest run right now, outside the schedule</p>
        {result && (
          <p className={`text-xs mt-1 font-medium ${
            result.status === 'success' ? 'text-green-600'
            : result.status === 'skipped' ? 'text-yellow-600'
            : 'text-red-600'
          }`}>
            {result.status === 'success' ? `Sent — ${result.itemCount} items`
              : result.status === 'skipped' ? 'Skipped — no new content'
              : `Error: ${result.error}`}
          </p>
        )}
      </div>
      <button
        onClick={handleRun}
        disabled={status === 'running'}
        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50"
      >
        {status === 'running' ? 'Running…' : 'Run Now'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Implement RunHistory**

Create `app/components/RunHistory.tsx`:
```typescript
'use client'

import type { RunEntry } from '@/lib/types'

function StatusBadge({ status }: { status: RunEntry['status'] }) {
  if (status === 'success') return <span className="text-green-600 font-medium text-sm">✓ success</span>
  if (status === 'skipped') return <span className="text-yellow-600 font-medium text-sm">— skipped</span>
  return <span className="text-red-600 font-medium text-sm">✗ error</span>
}

export function RunHistory({ runs }: { runs: RunEntry[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Run History <span className="font-normal normal-case text-gray-400">(last 30 runs)</span>
      </h2>
      {runs.length === 0 ? (
        <p className="text-sm text-gray-400">No runs yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
              <th className="text-left pb-2 font-medium">Timestamp</th>
              <th className="text-left pb-2 font-medium">Status</th>
              <th className="text-left pb-2 font-medium">Items</th>
              <th className="text-left pb-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(run => (
              <tr key={run.id} className="border-b border-gray-50 last:border-0">
                <td className="py-2.5 text-gray-700">{new Date(run.timestamp).toLocaleString()}</td>
                <td className="py-2.5"><StatusBadge status={run.status} /></td>
                <td className="py-2.5 text-gray-500">{run.itemCount ?? '—'}</td>
                <td className="py-2.5 text-xs text-gray-400">
                  {run.error ?? (run.status === 'skipped' ? 'No new content' : '')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Implement admin page**

Replace the contents of `app/page.tsx`:
```typescript
import { getConfig, getRuns } from '@/lib/kv'
import { ConfigForm } from '@/app/components/ConfigForm'
import { ManualRunButton } from '@/app/components/ManualRunButton'
import { RunHistory } from '@/app/components/RunHistory'

export default async function AdminPage() {
  const [config, runs] = await Promise.all([getConfig(), getRuns()])

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Databricks Release Notes Digest</h1>
          <p className="text-sm text-gray-500 mt-0.5">Admin Dashboard</p>
        </div>
        <span className="text-xs text-gray-400">Scheduled: daily at 08:00 UTC</span>
      </div>
      <ConfigForm initialEmail={config?.email ?? ''} />
      <ManualRunButton />
      <RunHistory runs={runs} />
    </main>
  )
}
```

- [ ] **Step 5: Update root layout**

Replace the contents of `app/layout.tsx`:
```typescript
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Databricks Digest Admin',
  description: 'Configure and monitor the Databricks release notes digest',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}
```

- [ ] **Step 6: Start dev server and verify the UI renders**

```bash
npm run dev
```

Open http://localhost:3000. Verify:
- Header shows "Databricks Release Notes Digest / Admin Dashboard"
- Email input field and Save button visible
- "Run Now" button visible
- Run history section shows "No runs yet"

Note: if KV environment variables are empty, the page will render with empty/default values — that is expected in local dev without a real KV connection. Use `vercel dev` (after linking project) to get live KV access locally.

- [ ] **Step 7: Commit**

```bash
git add app/
git commit -m "feat: add admin UI — config form, manual run, and run history"
```

---

### Task 12: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/digest.yml`

- [ ] **Step 1: Create workflow**

```bash
mkdir -p .github/workflows
```

Create `.github/workflows/digest.yml`:
```yaml
name: Daily Databricks Digest

on:
  schedule:
    - cron: "0 8 * * *"   # 08:00 UTC every day
  workflow_dispatch:       # allow manual trigger from GitHub Actions UI

jobs:
  run-digest:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger digest API
        run: |
          status=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST "${{ secrets.VERCEL_APP_URL }}/api/digest" \
            -H "Authorization: Bearer ${{ secrets.DIGEST_SECRET }}")
          echo "HTTP status: $status"
          if [ "$status" != "200" ]; then
            echo "Digest job failed with status $status"
            exit 1
          fi
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "feat: add GitHub Actions daily cron workflow"
```

---

### Task 13: Vercel Deployment

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create Vercel config**

Create `vercel.json`:
```json
{
  "framework": "nextjs"
}
```

- [ ] **Step 2: Push to GitHub**

Create a new repository at https://github.com/new named `databricks-release-notes`, then:

```bash
git remote add origin https://github.com/szmizorsz/databricks-release-notes.git
git branch -M main
git push -u origin main
```

- [ ] **Step 3: Deploy to Vercel**

```bash
npx vercel --prod
```
Follow the prompts to link to your Vercel account. When asked about the project settings, accept all defaults (Next.js is auto-detected).

Alternatively use the Vercel dashboard: https://vercel.com/new → Import Git Repository → select `databricks-release-notes`.

- [ ] **Step 4: Set up Vercel KV**

1. Open Vercel dashboard → your project → **Storage** tab
2. Click **Create Database** → **KV**
3. Name it `databricks-digest-kv`, choose the region closest to you
4. Click **Connect to Project** — this automatically adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to your project environment variables

- [ ] **Step 5: Add remaining environment variables**

In Vercel dashboard → Project → **Settings** → **Environment Variables**, add:

| Name | Value |
|---|---|
| `DIGEST_SECRET` | Generate with: `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | From https://console.anthropic.com |
| `RESEND_API_KEY` | From https://resend.com/api-keys |

- [ ] **Step 6: Redeploy after adding env vars**

```bash
npx vercel --prod
```

- [ ] **Step 7: Add GitHub Actions secrets**

In GitHub → your repo → **Settings** → **Secrets and variables** → **Actions**, add:

| Secret | Value |
|---|---|
| `DIGEST_SECRET` | Same value as Vercel env var |
| `VERCEL_APP_URL` | Your deployment URL, e.g. `https://databricks-release-notes.vercel.app` |

- [ ] **Step 8: Trigger a manual test run**

In GitHub → Actions → "Daily Databricks Digest" → **Run workflow**. Check:
- The workflow completes successfully (green checkmark)
- Vercel function logs show the digest ran
- Check your inbox (szmizorsz@gmail.com) for the email

- [ ] **Step 9: Set your email in the admin UI**

Open your Vercel deployment URL → enter `szmizorsz@gmail.com` in the email field → click Save.

- [ ] **Step 10: Final commit**

```bash
git add vercel.json
git commit -m "feat: add Vercel deployment config"
git push
```

---

## Summary

| Tasks | What gets built |
|---|---|
| 1 | Project scaffold, Vitest config, env setup |
| 2 | Shared TypeScript types |
| 3 | Vercel KV helpers (config + run history) |
| 4 | Bearer token auth helper |
| 5 | Cheerio scraper for 3 Databricks docs pages |
| 6 | Claude API narrative summarizer |
| 7 | Resend HTML email builder (3-section format) |
| 8 | Digest orchestrator (scrape → summarize → email → log) |
| 9 | Token-protected API routes |
| 10 | Server Actions for admin UI |
| 11 | Admin UI (config, manual run, run history) |
| 12 | GitHub Actions daily cron workflow |
| 13 | Vercel deployment + KV setup |
