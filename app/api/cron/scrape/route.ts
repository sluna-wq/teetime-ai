import { NextRequest, NextResponse } from 'next/server'
import { scrapeAllCourses } from '@/lib/scraper'

export const maxDuration = 300 // 5 min max (Vercel hobby limit)

export async function GET(req: NextRequest) {
  // Authenticate cron requests
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const daysAhead = Number(req.nextUrl.searchParams.get('days') || process.env.SCRAPE_DAYS_AHEAD || 15)
    const courseSlugs = req.nextUrl.searchParams
      .get('courses')
      ?.split(',')
      .map((slug) => slug.trim())
      .filter(Boolean)
    const result = await scrapeAllCourses(daysAhead, courseSlugs)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
