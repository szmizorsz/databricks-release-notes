# Databricks Release Notes Digest — Design Spec

**Date:** 2026-05-28
**Status:** Approved — amended 2026-05-30 (RSS feed, HTML email rendering, hardcoded sender)

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
| Scraper | Cheerio + node `fetch` (RSS) | Fetch and parse Databricks RSS feed |
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

**Source:** Databricks RSS feed — `https://docs.databricks.com/aws/en/feed.xml`

The Databricks docs site restructured in mid-2026 from per-category HTML pages to a unified RSS feed. The scraper uses the RSS feed instead of HTML scraping.

**Process:**
1. Fetch the RSS feed via `fetch()` with a browser-like `User-Agent` header.
2. Parse XML with Cheerio (`xmlMode: true`); iterate `<item>` elements.
3. Filter items where `<pubDate>` matches today or yesterday (UTC) to handle timezone edge cases.
4. For each matching item, extract:
   - `category` — from `<category>` tags; prefer specific tags (e.g. "Databricks Apps", "Lakeflow Designer") over generic ones ("Product", "Security"); fall back to "Platform". Skip "whatscoming" tags.
   - `text` — `title — stripped description` (plain text, for Claude summarizer)
   - `descriptionHtml` — raw HTML from `<description>` CDATA (preserves bullet lists, bold, etc., for email rendering)
   - `sourceUrl` — from `<guid>` (direct link to the release note entry)
5. If zero items found: log a `skipped` run entry and exit without sending email.
6. On any fetch/parse error: return `[]` (graceful degradation per page is not applicable with a single feed; the orchestrator catches and logs as `error`).

---

## Email Format

HTML email sent via Resend with subject `Databricks Release Notes — {date}`.

**Section 1 — Structured Summary**
Items grouped by category (e.g. "Databricks Apps", "Lakeflow Designer", "Platform"). Each item renders its title in bold followed by its original RSS HTML (`descriptionHtml`), preserving bullet lists, bold feature names, and inline code exactly as published by Databricks.

**Section 2 — AI Narrative Summary**
Claude (`claude-sonnet-4-6`) produces a 150–250 word narrative digest. Prompt instructs it to highlight the most impactful changes and call out anything worth acting on. Claude receives plain-text content (`text` field) not the raw HTML.

**Section 3 — Source Links**
List of unique `sourceUrl` values from scraped items — one direct link per release note entry (e.g. `https://docs.databricks.com/aws/en/release-notes/product/2026/may#lakeflow-designer-updates-for-may-29-2026`).

**Sender address:** `onboarding@resend.dev` (Resend's shared sender, no domain verification required). Hardcoded in `lib/emailer.ts`.

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
- `KV_REST_API_URL` — from Upstash dashboard (Vercel KV replacement)
- `KV_REST_API_TOKEN` — from Upstash dashboard

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
│   ├── scraper.ts                # RSS feed fetch + parse (Cheerio XML mode)
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
