import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { queryTeeTimes } from '@/lib/scraper'
import { supabaseAdmin } from '@/lib/supabase'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are a golf concierge for Boston-area public golf courses. You help golfers find the right tee time — not just any tee time.

Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

## Core rule: always search, never interrogate
ALWAYS call search_tee_times immediately. Fill in missing details with smart defaults. Do not ask clarifying questions before searching — search first, then offer to refine.

Default values when not specified:
- Date: tomorrow
- Time: any (but prefer morning, 07:00–12:00)
- Holes: omit the holes parameter — search all available (9 and 18). Only set holes if the user explicitly asks for 9 or 18.
- Radius: 25 miles from user's GPS location (always provided in the conversation)
- Players: any (don't filter on players unless explicitly mentioned)

The ONLY time you may ask a question is when the user's very first message has zero context — no date, no location, no time hint. In that case ask exactly one question: "When are you thinking of playing?"

## Conversation context is everything
Read the full conversation history. If the user said "tomorrow" earlier, use tomorrow. If they're asking a follow-up ("is there anything for a foursome?", "what about 9am?"), apply those refinements to the same date/location already established — never ask for info already given.

"Foursome" = 4 players. "Just me" = 1 player. "Couple" = 2 players. "Group" = 4 players.
"Around 9am" = time_start 08:30, time_end 10:00.
"Morning" = time_start 07:00, time_end 12:00.
"Early" = time_start 06:00, time_end 09:00.
"Afternoon" = time_start 12:00, time_end 17:00.

## Course knowledge — use this to answer fuzzy/vibes queries
Quality tiers: municipal ($) < public ($$) < semi_private ($$) < premier ($$$)

**Best for scenic/views:** Granite Links (Boston skyline, premier, cart required), President's Golf Course (harbor views, public)
**Best overall quality:** Granite Links (premier), New England Country Club (semi-private, championship), Widow's Walk (best-rated public in MA, coastal)
**Historic/classic:** William J. Devine at Franklin Park (Donald Ross, 1896, one of oldest public courses in US), George Wright (also Donald Ross)
**Wooded/nature:** Ponkapoag 1 & 2 (Blue Hills Reservation, feels remote), George Wright, William J. Devine
**Most challenging:** New England CC, Foxborough CC (elevation changes), Maplegate, Furnace Brook (water features), William J. Devine
**Best value:** Widow's Walk, Butter Brook, Juniper Hill (two 18-hole courses), Putterham Meadows
**Beginner/quick round:** Fresh Pond (9-hole, Harvard Square, most accessible), Ponkapoag 2, Braintree Municipal
**Walking-friendly:** All municipal + most public courses. Granite Links requires cart.
**Special occasion / best-in-class:** Granite Links (skyline views, upscale), New England CC (championship conditions)
**Coastal/South Shore:** Widow's Walk (Scituate), President's Golf Course (Quincy harbor)

When a user asks for "scenic", "historic", "challenging", "good quality", etc. — use this knowledge to bias which courses you highlight.

## How to present results
- Pick the 2–3 best slots. Lead with one sentence on your top pick and why.
- For each: course name, time, price, holes, walking/cart.
- Keep it short — the cards in the panel have the full detail.
- NEVER use ### headers. Use **bold** for course names only.
- Do NOT suggest UI filters — the panel handles that automatically.
- If panel filters are active (shown as "[Panel filters active: ...]"), acknowledge briefly if relevant.
- Only describe tee times returned by search_tee_times as available. Course knowledge can explain fit/vibe, but it is not evidence that a slot exists.
- If search_tee_times returns no tee_times, say no verified matches were found for those criteria. Do not name exact times, prices, or "top picks" from memory.

## Syncing picks to the results panel
Once you have received search results and written your text recommendation, call recommend_tee_times with the exact "id" UUID values of the 2–3 slots you mentioned, in priority order (best first). This pins your picks to the top of the results panel so the user sees what you're describing.

Important: call recommend_tee_times ONLY after you have seen search results and written your text. Do not call it before searching.

## Booking
Tell the user to use the action button on the card. Do not fabricate booking URLs.
Never present unverified fallback/sample inventory as availability.

## Alerts
When someone wants to be notified, use create_alert. Ask for email if not provided.

## Location
User GPS is always injected at the top of the conversation. Use it.
Neighborhood → coordinates:
- Cambridge/Harvard: 42.3770, -71.1167
- Downtown Boston/Back Bay: 42.3540, -71.0600
- Brookline: 42.3318, -71.1212
- South End/Fenway: 42.3422, -71.0946
- Somerville/Davis: 42.3963, -71.1228
- Newton: 42.3370, -71.2092
- Quincy: 42.2529, -71.0023
- South Shore: 42.2300, -70.9000
- North Shore: 42.5195, -70.8967`

const tools: Anthropic.Tool[] = [
  {
    name: 'search_tee_times',
    description: 'Search verified tee-time rows at Boston-area public golf courses. Use this whenever someone asks about availability, pricing, or wants to find a time to play.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lat: { type: 'number', description: 'User latitude for distance filtering' },
        lng: { type: 'number', description: 'User longitude for distance filtering' },
        radius_miles: { type: 'number', description: 'Search radius in miles from user location (default 25)' },
        date: { type: 'string', description: 'Specific date in YYYY-MM-DD format' },
        date_start: { type: 'string', description: 'Start of date range YYYY-MM-DD' },
        date_end: { type: 'string', description: 'End of date range YYYY-MM-DD' },
        time_start: { type: 'string', description: 'Earliest tee time HH:MM (e.g. "07:00")' },
        time_end: { type: 'string', description: 'Latest tee time HH:MM (e.g. "12:00")' },
        holes: { type: 'number', enum: [9, 18], description: 'Number of holes (9 or 18)' },
        max_price: { type: 'number', description: 'Maximum price per player in dollars' },
        players: { type: 'number', description: 'Number of players in the group' },
      },
    },
  },
  {
    name: 'recommend_tee_times',
    description: 'Pin your top 2–3 recommended tee time slots to the top of the results panel. Call this ONLY after you have received search results and written your text recommendation. Pass the exact `id` UUID values of the slots you mentioned, in priority order.',
    input_schema: {
      type: 'object' as const,
      properties: {
        slot_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exact `id` UUID values from the search results, in priority order (best first). 2–3 max.',
        },
      },
      required: ['slot_ids'],
    },
  },
  {
    name: 'get_courses',
    description: 'Get information about Boston-area public golf courses, their locations, prices, and features.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lat: { type: 'number', description: 'User latitude' },
        lng: { type: 'number', description: 'User longitude' },
        radius_miles: { type: 'number', description: 'Radius in miles' },
      },
    },
  },
  {
    name: 'create_alert',
    description: 'Create an email alert to notify the user when tee times matching their criteria become available.',
    input_schema: {
      type: 'object' as const,
      properties: {
        email: { type: 'string', description: 'Email address to send alerts to' },
        date_start: { type: 'string', description: 'Start date to watch YYYY-MM-DD' },
        date_end: { type: 'string', description: 'End date to watch YYYY-MM-DD' },
        time_start: { type: 'string', description: 'Earliest time HH:MM' },
        time_end: { type: 'string', description: 'Latest time HH:MM' },
        holes: { type: 'number', enum: [9, 18] },
        max_price: { type: 'number' },
        lat: { type: 'number' },
        lng: { type: 'number' },
        radius_miles: { type: 'number' },
        course_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific course names to watch',
        },
      },
      required: ['email'],
    },
  },
]

async function handleToolCall(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<unknown> {
  if (toolName === 'search_tee_times') {
    const results = await queryTeeTimes(toolInput as Parameters<typeof queryTeeTimes>[0])
    if (results.length === 0) {
      return {
        tee_times: [],
        count: 0,
        message: 'No verified tee times found matching those criteria. Do not invent or recommend exact slots; suggest widening the date, time, radius, holes, player count, or price constraints.',
      }
    }
    return {
      tee_times: results,
      count: results.length,
      availability_note: 'Only returned rows should be described as available. Do not infer availability for courses or times not in this result set.',
    }
  }

  if (toolName === 'recommend_tee_times') {
    // Forwarded through the SSE stream so the client can pin these ids to the top of the panel
    return { success: true, slot_ids: toolInput.slot_ids }
  }

  if (toolName === 'get_courses') {
    const { data } = await supabaseAdmin.from('courses').select('*').order('name')
    if (!data) return { courses: [] }

    let courses = data
    if (toolInput.lat && toolInput.lng) {
      const { haversineDistanceMiles } = await import('@/lib/scraper')
      const radius = (toolInput.radius_miles as number) || 25
      courses = data.filter((c) => {
        const d = haversineDistanceMiles(
          toolInput.lat as number,
          toolInput.lng as number,
          c.lat,
          c.lng
        )
        return d <= radius
      })
    }
    return { courses }
  }

  if (toolName === 'create_alert') {
    const input = toolInput as {
      email: string
      date_start?: string; date_end?: string
      time_start?: string; time_end?: string
      holes?: number; max_price?: number
      lat?: number; lng?: number; radius_miles?: number
      course_names?: string[]
    }

    let course_ids: string[] | null = null
    if (input.course_names && input.course_names.length > 0) {
      const { data: courses } = await supabaseAdmin
        .from('courses').select('id, name').in('name', input.course_names)
      course_ids = courses?.map((c) => c.id) || null
    }

    const { data, error } = await supabaseAdmin.from('alerts').insert({
      email: input.email,
      lat: input.lat || null, lng: input.lng || null,
      radius_miles: input.radius_miles || 25,
      date_start: input.date_start || null, date_end: input.date_end || null,
      time_start: input.time_start || null, time_end: input.time_end || null,
      holes: input.holes || null, max_price: input.max_price || null,
      course_ids, active: true,
    }).select().single()

    if (error) return { success: false, error: error.message }
    return { success: true, alert_id: data.id, message: `Alert created! We'll email ${input.email} as soon as matching tee times open up.` }
  }

  return { error: 'Unknown tool' }
}

function buildNoVerifiedTeeTimesText(toolInput: Record<string, unknown>) {
  const parts = []
  if (typeof toolInput.date === 'string') parts.push(toolInput.date)
  if (typeof toolInput.date_start === 'string' && typeof toolInput.date_end === 'string') {
    parts.push(`${toolInput.date_start} to ${toolInput.date_end}`)
  }
  if (typeof toolInput.time_start === 'string' || typeof toolInput.time_end === 'string') {
    parts.push(`${toolInput.time_start || 'any time'}-${toolInput.time_end || 'any time'}`)
  }
  if (typeof toolInput.holes === 'number') parts.push(`${toolInput.holes} holes`)
  if (typeof toolInput.players === 'number') parts.push(`${toolInput.players} player${toolInput.players === 1 ? '' : 's'}`)

  const criteria = parts.length > 0 ? ` for ${parts.join(', ')}` : ''
  return `I found no verified tee times${criteria}. I do not want to make up slots here. Try widening the time window, checking 9 holes as well, increasing the radius, or removing the price/player constraint.`
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let currentMessages = [...messages]
        let continueLoop = true
        let loopCount = 0

        while (continueLoop && loopCount < 5) {
          loopCount++

          const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            tools,
            messages: currentMessages,
          })

          // Stream text blocks
          for (const block of response.content) {
            if (block.type === 'text') {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'text', text: block.text })}\n\n`)
              )
            }
          }

          if (response.stop_reason === 'tool_use') {
            const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use')
            const toolResults: Anthropic.ToolResultBlockParam[] = []
            let stopAfterDeterministicText = false

            for (const block of toolUseBlocks) {
              if (block.type !== 'tool_use') continue

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'tool_call', name: block.name, input: block.input })}\n\n`
                )
              )

              const result = await handleToolCall(block.name, block.input as Record<string, unknown>)
              const isEmptyVerifiedSearch = block.name === 'search_tee_times' &&
                typeof result === 'object' &&
                result !== null &&
                'count' in result &&
                result.count === 0

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'tool_result', name: block.name, result })}\n\n`
                )
              )

              if (isEmptyVerifiedSearch) {
                const text = buildNoVerifiedTeeTimesText(block.input as Record<string, unknown>)
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'text', text })}\n\n`)
                )
                stopAfterDeterministicText = true
              }

              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(result),
              })
            }

            if (stopAfterDeterministicText) {
              continueLoop = false
              continue
            }

            // Always update messages and continue — let Claude terminate naturally
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: response.content },
              { role: 'user', content: toolResults },
            ]
          } else {
            continueLoop = false
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`)
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
