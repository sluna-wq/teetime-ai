import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { queryTeeTimes } from '@/lib/scraper'
import { supabaseAdmin } from '@/lib/supabase'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are a golf tee time assistant for Boston-area public golf courses. Your job is to help golfers find available tee times, understand their options, and set alerts for future availability.

You have access to real-time tee time data for 18 Boston-area public golf courses. When someone asks about availability, use the search_tee_times tool immediately — don't ask clarifying questions before searching.

Be conversational and concise. Lead with the best matching tee times. When showing results:
- Mention the course name, date, time, price, and holes
- Note if cart is included or walking is allowed
- Give clear, actionable next steps to book

When someone wants to be notified about future openings (e.g., "let me know when Saturday opens up"), use create_alert to set up an email alert.

Today's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

Boston area center coordinates: 42.3601° N, 71.0589° W.

If someone says they're near a specific neighborhood or area, translate to approximate coordinates:
- Cambridge/Harvard: 42.3770, -71.1167
- Downtown Boston/Back Bay: 42.3540, -71.0600
- Brookline: 42.3318, -71.1212
- South End/Fenway: 42.3422, -71.0946
- Somerville/Davis: 42.3963, -71.1228
- Newton: 42.3370, -71.2092
- Quincy: 42.2529, -71.0023
- South Shore: 42.2300, -70.9000
- North Shore/Salem: 42.5195, -70.8967`

const tools: Anthropic.Tool[] = [
  {
    name: 'search_tee_times',
    description: 'Search for available tee times at Boston-area public golf courses. Use this whenever someone asks about availability, pricing, or wants to find a time to play.',
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
    description: 'Create an email alert to notify the user when tee times matching their criteria become available. Use this when someone says things like "let me know when...", "alert me if...", "notify me when...", or wants to be notified about future openings.',
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
      return { message: 'No tee times found matching those criteria. Try widening the date range, increasing the radius, or raising the price limit.' }
    }
    return { tee_times: results, count: results.length }
  }

  if (toolName === 'get_courses') {
    let query = supabaseAdmin.from('courses').select('*').order('name')

    const { data } = await query
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
      date_start?: string
      date_end?: string
      time_start?: string
      time_end?: string
      holes?: number
      max_price?: number
      lat?: number
      lng?: number
      radius_miles?: number
      course_names?: string[]
    }

    // Look up course IDs from names if provided
    let course_ids: string[] | null = null
    if (input.course_names && input.course_names.length > 0) {
      const { data: courses } = await supabaseAdmin
        .from('courses')
        .select('id, name')
        .in('name', input.course_names)
      course_ids = courses?.map((c) => c.id) || null
    }

    const { data, error } = await supabaseAdmin
      .from('alerts')
      .insert({
        email: input.email,
        lat: input.lat || null,
        lng: input.lng || null,
        radius_miles: input.radius_miles || 25,
        date_start: input.date_start || null,
        date_end: input.date_end || null,
        time_start: input.time_start || null,
        time_end: input.time_end || null,
        holes: input.holes || null,
        max_price: input.max_price || null,
        course_ids,
        active: true,
      })
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, alert_id: data.id, message: `Alert created! We'll email ${input.email} as soon as matching tee times open up.` }
  }

  return { error: 'Unknown tool' }
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let currentMessages = [...messages]
        let continueLoop = true

        while (continueLoop) {
          const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            tools,
            messages: currentMessages,
          })

          // Stream text as it comes
          for (const block of response.content) {
            if (block.type === 'text') {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'text', text: block.text })}\n\n`)
              )
            }
          }

          if (response.stop_reason === 'tool_use') {
            // Process tool calls
            const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use')
            const toolResults: Anthropic.ToolResultBlockParam[] = []

            for (const block of toolUseBlocks) {
              if (block.type !== 'tool_use') continue

              // Stream tool call info to client
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'tool_call', name: block.name, input: block.input })}\n\n`
                )
              )

              const result = await handleToolCall(block.name, block.input as Record<string, unknown>)

              // Stream tool result to client (for map/cards)
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'tool_result', name: block.name, result })}\n\n`
                )
              )

              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(result),
              })
            }

            // Continue the conversation with tool results
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
