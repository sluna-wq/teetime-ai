import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const FRESH_MINUTES = Number(process.env.TEE_TIME_FRESH_MINUTES || 45)

export async function GET() {
  const freshSince = new Date(Date.now() - FRESH_MINUTES * 60 * 1000).toISOString()

  const [{ data: recentLogs }, { data: freshRows, error }] = await Promise.all([
    supabaseAdmin
      .from('scrape_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('tee_times')
      .select('source, scraped_at, course:courses(name, slug)')
      .gte('scraped_at', freshSince)
      .neq('source', 'demo')
      .limit(1000),
  ])

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const byCourse = new Map<string, {
    course: string
    slug: string
    fresh_rows: number
    latest_verified_at: string
    sources: Set<string>
  }>()

  for (const row of freshRows || []) {
    const course = Array.isArray(row.course) ? row.course[0] : row.course
    if (!course) continue
    const key = course.slug
    const existing = byCourse.get(key) || {
      course: course.name,
      slug: course.slug,
      fresh_rows: 0,
      latest_verified_at: row.scraped_at,
      sources: new Set<string>(),
    }
    existing.fresh_rows += 1
    existing.sources.add(row.source)
    if (row.scraped_at > existing.latest_verified_at) {
      existing.latest_verified_at = row.scraped_at
    }
    byCourse.set(key, existing)
  }

  const courses = [...byCourse.values()].map((course) => ({
    ...course,
    sources: [...course.sources],
  }))

  return NextResponse.json({
    ok: courses.length > 0,
    fresh_window_minutes: FRESH_MINUTES,
    fresh_tee_times: freshRows?.length || 0,
    covered_courses: courses.length,
    courses,
    recent_scrapes: recentLogs || [],
  })
}
