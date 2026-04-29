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
- `lib/scraper.ts` - tee-time scrape and query logic.
- `lib/courses.ts` - static Boston course catalog.
- `supabase/schema.sql` - database schema.
