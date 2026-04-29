# TeeTime AI — HBS DAIL Project Summary

## The Problem

Finding a tee time at a public golf course in Boston is surprisingly painful. There are 18+ public courses within 25 miles of the city, spread across GolfNow, individual course websites, and phone lines. A golfer who wants to play "something scenic this Saturday morning, walking, under $50" has no good option: GolfNow requires knowing exactly which course you want, and each course website requires a separate visit. There's no way to express intent and get back recommendations.

This is a narrow, high-signal problem. The query space is structured (date, time, holes, price, location, quality preferences), the supply is finite (18 courses), and the mismatch between what users want to say and what existing interfaces let them say is obvious.

## The Core Idea: Claude as the Interface

TeeTime AI is built on a single design premise: **the AI is not bolted onto a traditional search UI — the AI IS the search**. There are no dropdown menus, date pickers, or checkboxes to find a tee time. You tell the app what you want in plain language, and it searches for you.

This is meaningfully different from a "chatbot wrapper" in several ways:

1. **Intent resolution, not keyword matching.** When a user says "early morning round for a foursome near Cambridge this weekend, something scenic," the AI resolves `foursome → 4 players`, `early morning → 07:00–09:00`, `near Cambridge → lat 42.377, lng -71.117`, `scenic → Granite Links or President's Golf Course` — and calls a structured tool that hits a real database. The AI bridges natural language to a database query.

2. **Fuzzy criteria the UI can never express.** Filters like "historic," "scenic," "challenging," or "special occasion" cannot be checkboxes. They require interpretation. The AI uses course metadata (quality tier, characteristics like `donald_ross`, `skyline_views`, `coastal`) to resolve these vibes queries and bias its narrative toward matching courses.

3. **Refinement without re-entry.** After the first search, the user can say "what about just 9 holes?" or "is there anything cheaper?" without repeating themselves. The AI reads conversation history and applies refinements. Deterministic post-search filters (price, walking, holes) live in the results panel as instant client-side toggles — no AI re-query needed.

4. **Zero interrogation.** A traditional booking assistant might ask "What date?" "How many players?" "Which course?" TeeTime AI searches immediately with smart defaults and offers to refine afterward. The design principle: search first, clarify never (unless the first message has zero context).

## Architecture

```
User → ChatPanel (Next.js) → /api/chat (Claude Sonnet 4.6, SSE)
                                      ↓ tool_call: search_tee_times
                                      ↓ → Supabase (tee_times table)
                                      ↓ tool_result → results panel
                                      ↓ text stream → chat bubble
```

**Frontend (Next.js 14 App Router + TypeScript + Tailwind)**
- `ChatPanel`: pure conversation. User types intent; Claude responds with narrative + triggers tool calls.
- `ResultsPanel`: receives structured `TeeTime[]` from tool results. Shows ranked list with client-side filters (walking, price, holes, sort). Separate from chat — results update live as Claude searches.
- `Map` (Mapbox GL): interactive markers showing slot counts per course. Click opens popup with top 4 available times and inline booking links.
- Layout: 340px chat sidebar + flexible results panel. The chat is the primary interface; the results panel is the output layer.

**Backend (Next.js API Routes)**
- `/api/chat`: Claude Sonnet 4.6 with tool_use. Streams Server-Sent Events to the client: `{ type: 'text' }`, `{ type: 'tool_call', name, input }`, `{ type: 'tool_result', name, result }`, `[DONE]`. Multi-turn loop handles tool_use → result → continue.
- `/api/cron/scrape`: GolfNow scraper with JSON API and HTML parsing. Runs every 30 minutes via cron-job.org.
- `/api/cron/check-alerts`: Queries active alerts against current tee times, sends email via Resend when matches found.
- `/api/seed`: Seeds course static data to Supabase.

**Data (Supabase Postgres)**
- `courses`: 18 Boston-area public courses with location, pricing, GolfNow IDs. Static, seeded from code.
- `tee_times`: Live availability scraped every 30 min. Upsert with unique constraint on `(course_id, tee_date, tee_time, holes)` for deduplication.
- `alerts`: User-defined notification preferences (email, date range, time, price, location).
- `scrape_logs`: Tracks scrape run outcomes per course.

**AI Integration (Claude API)**
Three tools exposed to Claude:
- `search_tee_times(date, time_start, time_end, holes, max_price, players, lat, lng, radius_miles)` — structured Supabase query
- `get_courses(lat, lng, radius_miles)` — returns course info for map/context
- `create_alert(email, criteria...)` — stores notification preferences

The system prompt encodes course knowledge (scenic, historic, challenging, quality tier) so Claude can make opinionated recommendations, not just surface database results.

**Alerts (Resend)**
Users can say "let me know if anything opens up at Granite Links this weekend." Claude calls `create_alert`. The cron job checks these against live tee times every 30 minutes and emails when matches appear.

## Key Design Decisions

**Results separate from chat.** Early versions embedded tee time cards inside chat bubbles. This was confusing — the conversation felt cluttered, and users couldn't compare options at a glance. The final design puts results in a dedicated panel that updates when Claude searches. Chat remains a clean conversational thread.

**Verified availability only.** GolfNow and course booking engines block automated requests intermittently. The app tries the GolfNow JSON API first, then falls back to HTML parsing. If no verified rows are found, the product shows no availability instead of filling the gap with deterministic demo slots. Reliability here means the system is allowed to say "I don't know."

**Haversine distance filtering.** Rather than filtering by city or zip code, the backend calculates actual GPS distance from the user's location. The user's GPS coordinates are injected into every message sent to Claude, enabling radius-based queries without the user typing an address.

**Filter domain split.** Hard/binary criteria (18 holes, under $40, walking) are instant client-side UI filters. Fuzzy criteria (scenic, historic, quality) are handled by the AI using course metadata. This split keeps the UI fast and the AI useful — neither domain steps on the other.

**Lifted filter state with search context sync.** When Claude fires `search_tee_times` with `holes: 18`, the frontend automatically activates the "18 holes" filter pill in the results panel. When the user later goes back to chat, the active filters are appended as context to the message sent to Claude: `[Panel filters active: 18 holes, under $40]`. This closes the loop — chat knows what's filtered, Claude knows what the user already narrowed down.

**Loading state machine.** A `LoadStatus` enum (`idle → thinking → searching → streaming`) prevents the loading indicator from flickering when Claude transitions from thinking to tool call to generating text. The typing dots persist with a context label ("Checking tee times…") through the entire tool_use cycle, only disappearing when streaming text begins.

## Challenges

**Supabase module-level initialization.** Next.js collects all static pages at build time, which triggers module-level code. Calling `createClient()` with placeholder env vars (during Vercel build) threw an error before the app started. Fixed with a lazy Proxy pattern: the Supabase client isn't instantiated until the first actual call.

**Map click handler stale closure.** The Mapbox marker click handler captured a stale `markersRef.current[course.id]` reference — because the ref was only set after the marker was created. Fixed by creating the marker first, capturing the local variable reference, then registering the click handler.

**GolfNow booking links.** GolfNow facility IDs (like `4506`) don't map cleanly to bookable URLs without knowing the specific tee time. Rather than generating broken deep-links, booking redirects go to each course's own website (or a Google search as fallback), which is more reliable even if less direct.

**Vercel Hobby plan cron restriction.** Hobby plan only allows daily cron jobs; `*/30 * * * *` is rejected. Replaced with cron-job.org (free external cron) hitting the API endpoints with an Authorization header.

**Markdown rendering.** Claude's responses use markdown syntax. Without a proper renderer, `###`, `**text**`, and list syntax rendered as raw characters. Added `react-markdown` + `remark-gfm` with custom component overrides (heading levels flatten to `<p className="font-semibold">` to avoid oversized text in chat bubbles).

## What Makes It AI-Native

A traditional tee time finder would be: date picker → course selector → filter dropdowns → results grid. The AI would be a FAQ chatbot in the corner, maybe answering "what's the cancellation policy?"

TeeTime AI inverts this. The search interface is a conversation. The "filters" are words. The AI doesn't just answer questions about the system — it IS the system. The only traditional UI elements are the post-search result cards (for comparison), the map (for spatial orientation), and the lightweight filter pills (for instant client-side refinement after the AI has done the hard work of interpreting intent).

The AI earns its place: it resolves intent that a dropdown can never capture ("something scenic and historic for a serious round"), it maintains context across turns ("the foursome I mentioned" refers to the prior message), and it makes recommendations with opinions ("Widow's Walk is the best public course in Massachusetts — this is where I'd send you for a proper round").

## Stack and Deployment

- **Frontend/API**: Next.js App Router, TypeScript, Tailwind CSS
- **AI**: Claude Sonnet 4.6 via Anthropic API, streaming with tool_use
- **Database**: Supabase (Postgres), RLS enabled for public read access
- **Map**: Mapbox GL JS with dynamic import (SSR-safe)
- **Email**: Resend for alert notifications
- **Scraping**: Custom fetch-based scraper with HTML parser fallback
- **Hosting**: Vercel (Hobby), auto-deployed from GitHub
- **Cron**: cron-job.org (external) hitting Vercel API routes every 30 minutes
- **Build time**: ~2 days

## What Was Learned

**AI-native is a design constraint, not a feature.** The hard part wasn't integrating Claude — it was designing the product so that removing Claude would break it, not just degrade it. If you can imagine replacing the AI with a dropdown, you haven't built an AI-native product.

**Trust beats demo fullness.** In a booking product, reliable means "true or clearly unknown," not "always populated." The app now treats failed or empty scrapes as empty verified inventory, so the assistant cannot turn stale/sample rows into confident tee-time claims.

**Context injection is the key to conversational search.** GPS coordinates injected into every message, active filter state sent back to Claude on follow-ups, conversation history preserved across turns — these are what make the concierge feel coherent across a session. Without them, every message feels like the first message.

**Tool use is the interface.** The SSE stream from Claude isn't just text — it's a structured event stream that drives the entire UI: search status, result cards, map updates, alert creation. The API isn't just generating responses; it's orchestrating the application state.
