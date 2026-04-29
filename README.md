# TeeTime AI

AI-first tee time search for Boston-area public golf courses.

## What It Does

- Lets golfers ask for tee times in plain English.
- Streams Claude responses from `/api/chat`.
- Searches Supabase tee-time rows through structured tool calls.
- Shows results in a filterable list and Mapbox map.
- Supports email alerts for matching tee times.
- Shows only verified scraped tee-time rows; when none match, the app says so instead of fabricating availability.

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

```bash
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_MAPBOX_TOKEN=
RESEND_API_KEY=
CRON_SECRET=
```

## Useful Commands

```bash
npm run lint
npm run build
npm run eval
npm run eval:booking
```

## Project Map

- `app/page.tsx` - main app shell.
- `components/ChatPanel.tsx` - conversation UI and SSE client.
- `components/ResultsPanel.tsx` - list, filters, sorting, recommendations.
- `components/Map.tsx` - Mapbox course markers.
- `app/api/chat/route.ts` - Claude tool-use loop.
- `app/api/cron/scrape/route.ts` - scraper endpoint.
- `app/api/cron/check-alerts/route.ts` - alert email endpoint.
- `app/api/pilot/status/route.ts` - unattended-pilot health and fresh inventory coverage.
- `lib/scraper.ts` - tee-time scrape and query logic.
- `lib/courses.ts` - static Boston course catalog.
- `supabase/schema.sql` - database schema.

## 15-Day Pilot Reliability

The pilot should run from verified rows only:

- `SCRAPE_DAYS_AHEAD` can stay at the old value; the server caps provider scraping to `MAX_SCRAPE_DAYS_AHEAD` so long horizons do not break cron.
- `TEE_TIME_FRESH_MINUTES=45` hides rows older than the freshness window; the default is long enough for a 30-minute cron cadence without creating artificial empty gaps.
- `SUPPORTED_COURSE_SLUGS=putterham-meadows,furnace-brook,widows-walk` limits scraping to courses with provider adapters that are expected to hold up.
- `/api/cron/scrape?days=15` replaces each course/date with newly verified provider rows. The server caps the scrape window to `MAX_SCRAPE_DAYS_AHEAD` (default `7`) and limits each run to stale supported courses so the existing cron does not time out.
- `/api/cron/scrape?days=7&courses=putterham-meadows` remains available for targeted backfills, but the normal unattended pilot does not require changing cron URLs.
- `/api/pilot/status` reports fresh tee-time coverage by course and source.

Run the scrape every 5-10 minutes during the pilot for supported courses. If `/api/pilot/status` has `ok: false` or too few covered courses, the product should be treated as degraded rather than allowed to invent availability.
