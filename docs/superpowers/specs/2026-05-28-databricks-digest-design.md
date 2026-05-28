# Databricks Release Notes Digest — Design Spec

**Date:** 2026-05-28
**Status:** Approved

---

## Overview

A personal daily digest application that scrapes Databricks release notes, generates a structured + AI-narrative summary, and emails it to a personal address. An admin frontend deployed on Vercel provides email configuration and run history.

---

## Architecture

**Stack:** Next.js 15 (App Router), TypeScript, deployed to Vercel.

**Components:**

| Component | Technology | Purpose |
|---|---|---|
| Frontend | Next.js App Router | Admin UI (config + run history) |
| API routes | Next.js route handlers | Backend logic (digest job, config CRUD, run history) |
| Scraper | Cheerio + node `fetch` | Fetch and parse Databricks docs HTML |
| AI summary | Anthropic Claude API | Generate narrative digest from scraped content |
| Email | Resend SDK | Send HTML email |
| Storage | Vercel KV (Redis) | Persist config and run history |
| Scheduler | GitHub Actions cron | Trigger daily digest job |

---

## Data Model (Vercel KV)

### `config` key

```json
{ "email": "szmizorsz@gmail.com" }
```

### `runs` key

JSON array, newest first, capped at 30 entries:

```json
[
  {
    "id": "uuid",
    "timestamp": "2026-05-28T08:00:00Z",
    "status": "success",
    "itemCount": 14
  },
  {
    "id": "uuid",
    "timestamp": "2026-05-27T08:00:00Z",
    "status": "skipped",
    "itemCount": 0
  },
  {
    "id": "uuid",
    "timestamp": "2026-05-26T08:00:00Z",
    "status": "error",
    "error": "Scrape failed: HTTP 403"
  }
]
```

---

## API Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/digest` | Bearer token | Run the full digest job |
| GET | `/api/config` | Bearer token | Read current email config |
| PUT | `/api/config` | Bearer token | Update email config |
| GET | `/api/runs` | Bearer token | Fetch run history |

All routes check `Authorization: Bearer <DIGEST_SECRET>` and return `401` if missing or wrong.

---

## Scraping Pipeline

**Target pages:**
1. `https://docs.databricks.com/release-notes/product/` — Platform & Product
2. `https://docs.databricks.com/release-notes/runtime/` — Runtime
3. `https://docs.databricks.com/sql/release-notes/` — SQL / Serverless

**Process:**
1. Fetch each page HTML via `fetch()` with a browser-like `User-Agent` header.
2. Parse with Cheerio; locate dated section headings (e.g. "May 28, 2026").
3. Extract bullet items under today's (and yesterday's, to handle timezone edge cases) date block.
4. Tag each item with `{ category, text, sourceUrl }`.
5. If zero items found across all pages: log a `skipped` run entry and exit without sending email.
6. If scrape throws (HTTP error, parse failure): log an `error` run entry and exit.

---

## Email Format

HTML email sent via Resend with subject `Databricks Release Notes — {date}`.

**Section 1 — Structured Summary**
Bullet points grouped by category (Platform, Runtime, SQL). Generated directly from scraped items.

**Section 2 — AI Narrative Summary**
Claude (`claude-sonnet-4-6`) produces a 150–250 word narrative digest. Prompt instructs it to highlight the most impactful changes and call out anything worth acting on. Uses prompt caching on the system prompt.

**Section 3 — Source Links**
Plain list of the three scraped URLs for traceability.

---

## Admin UI

Single-page dashboard at the Vercel deployment root (`/`).

**Sections:**
1. **Configuration** — text input for target email address + Save button.
2. **Manual Run** — "Run Now" button with inline success/error feedback.
3. **Run History** — table of last 30 runs showing timestamp, status (success / skipped / error), item count, and error message if applicable.

The admin UI uses **Next.js Server Actions** for all mutations (save config, trigger run). Server Actions execute server-side, so the `DIGEST_SECRET` and other API keys are never exposed to the browser. Run history is fetched via a Server Component on page load.

No authentication on the UI itself — protected by obscurity of the Vercel URL. The underlying HTTP API route (`/api/digest`) is token-protected and used only by GitHub Actions.

---

## Scheduling

**GitHub Actions workflow:** `.github/workflows/digest.yml`

```yaml
on:
  schedule:
    - cron: "0 8 * * *"   # 08:00 UTC daily
  workflow_dispatch:       # allow manual trigger from GitHub UI
```

The workflow calls `POST https://<VERCEL_URL>/api/digest` with `Authorization: Bearer ${{ secrets.DIGEST_SECRET }}`.

**GitHub Secrets required:**
- `DIGEST_SECRET` — shared secret for API auth
- `VERCEL_APP_URL` — the deployed Vercel URL

**Vercel Environment Variables required:**
- `DIGEST_SECRET` — same shared secret
- `ANTHROPIC_API_KEY` — Claude API key
- `RESEND_API_KEY` — Resend API key
- `KV_REST_API_URL` — from Vercel KV dashboard
- `KV_REST_API_TOKEN` — from Vercel KV dashboard

---

## Security

| Surface | Protection |
|---|---|
| All `/api/*` routes | Bearer token (`DIGEST_SECRET`) |
| Admin UI (`/`) | Obscurity — no public link, personal tool only |
| API keys | Vercel environment variables (never in source) |

---

## Project Structure

```
databricks-release-notes/
├── app/
│   ├── page.tsx                  # Admin UI
│   ├── api/
│   │   ├── digest/route.ts       # Main digest job
│   │   ├── config/route.ts       # Config read/write
│   │   └── runs/route.ts         # Run history
│   └── layout.tsx
├── lib/
│   ├── scraper.ts                # Cheerio scraping logic
│   ├── summarizer.ts             # Claude API call
│   ├── emailer.ts                # Resend email builder + send
│   └── kv.ts                     # Vercel KV helpers
├── .github/
│   └── workflows/
│       └── digest.yml            # Daily cron trigger
├── package.json
└── vercel.json
```

---

## Out of Scope

- User authentication on the admin UI
- Multiple recipient email addresses
- Configuring the schedule from the UI (schedule lives in `digest.yml`)
- Historical re-sends or backfill
