import { supabaseAdmin } from './supabase'
import type { Course } from '@/types'

interface VerifiedTeeTime {
  time: string
  players: number
  holes: number
  price: number
  cartIncluded: boolean
  walkingAllowed: boolean
  bookingUrl?: string | null
  source: 'golfnow' | 'foreup'
}

type BookingIntegration =
  | { provider: 'cps'; url: string }
  | { provider: 'foreup'; url: string }
  | { provider: 'teeitup'; url: string; course: string }
  | { provider: 'chronogolf'; url: string }
  | { provider: 'teesnap'; url: string }
  | { provider: 'teequest'; url: string }
  | { provider: 'clubcaddie'; url: string }
  | { provider: 'northstar'; url: string }
  | { provider: 'official'; url: string }
  | { provider: 'phone'; url: string }

const BOOKING_INTEGRATIONS: Record<string, BookingIntegration> = {
  'fresh-pond': { provider: 'official', url: 'https://secure.cambridgema.gov/webtrac/web/search.html?module=GR' },
  'william-devine': { provider: 'cps', url: 'https://williamjdevine.cps.golf' },
  'george-wright': { provider: 'cps', url: 'https://georgewright.cps.golf' },
  'ponkapoag-1': { provider: 'official', url: 'https://www.mass.gov/locations/ponkapoag-golf-course' },
  'ponkapoag-2': { provider: 'official', url: 'https://www.mass.gov/locations/ponkapoag-golf-course' },
  'putterham-meadows': { provider: 'foreup', url: 'https://foreupsoftware.com/index.php/booking/19865/2748#teetimes' },
  'granite-links': { provider: 'northstar', url: 'https://www.granitelinks.com/reserve-a-tee-time' },
  'presidents': { provider: 'teeitup', url: 'https://presidents-golf-course.book.teeitup.com/', course: '17943' },
  'furnace-brook': { provider: 'foreup', url: 'https://foreupsoftware.com/index.php/booking/23086/8988#teetimes' },
  'braintree-municipal': { provider: 'official', url: 'https://www.braintreegolf.com/book-tee-times/' },
  'widows-walk': { provider: 'foreup', url: 'https://foreupsoftware.com/index.php/booking/20615/5120#teetimes' },
  'juniper-hill': { provider: 'cps', url: 'https://juniperhill.cps.golf' },
  'pinecrest': { provider: 'clubcaddie', url: 'https://customer-cc37.clubcaddie.com/login?clubid=103412' },
  'maplegate': { provider: 'teeitup', url: 'https://maplegate-country-club.book.teeitup.com/', course: '54f14d340c8ad60378b03704' },
  'butter-brook': { provider: 'cps', url: 'https://butterbrook.cps.golf' },
  'easton-cc': { provider: 'teequest', url: 'https://www.eastoncountryclub.com/teetimes' },
  'new-england-cc': { provider: 'teesnap', url: 'https://newenglandcc.teesnap.net/' },
  'foxborough-cc': { provider: 'phone', url: 'https://www.foxboroughcc.com/about/public-play' },
}

const FRESH_TEE_TIME_WINDOW_MINUTES = Number(process.env.TEE_TIME_FRESH_MINUTES || 20)
const SCRAPE_DAYS_AHEAD = Number(process.env.SCRAPE_DAYS_AHEAD || 15)
const SUPPORTED_COURSE_SLUGS = new Set(
  (process.env.SUPPORTED_COURSE_SLUGS || '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)
)

function getCourseFallbackUrl(course: Pick<Course, 'name' | 'website'>): string {
  return course.website ||
    `https://www.google.com/search?q=${encodeURIComponent(course.name + ' tee times reservation')}`
}

function isGolfNowFacilityUrl(url: string | null | undefined): boolean {
  return Boolean(url?.includes('golfnow.com/tee-times/facility/'))
}

function getGolfNowSearchUrl(
  course: Pick<Course, 'golfnow_facility_id' | 'golfnow_slug'>,
  date: string
): string | null {
  if (!course.golfnow_facility_id || !course.golfnow_slug) return null
  const [year, month, day] = date.split('-')
  const formattedDate = `${month}/${day}/${year}`
  return `https://www.golfnow.com/tee-times/facility/${course.golfnow_facility_id}-${course.golfnow_slug}/search#sortby=Time&view=Grouplist&holes=18&players=0&time=all&date=${formattedDate}`
}

function normalizeBookingUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('/')) return `https://www.golfnow.com${url}`
  return null
}

function isUsefulSlotBookingUrl(url: string | null | undefined): boolean {
  const normalized = normalizeBookingUrl(url)
  return Boolean(normalized && !isGolfNowFacilityUrl(normalized))
}

function withDateParam(url: string, date: string): string {
  const joiner = url.includes('?') ? '&' : '?'
  return `${url}${joiner}date=${date}`
}

function getCourseBookingUrl(
  course: Pick<Course, 'name' | 'slug' | 'website' | 'golfnow_facility_id' | 'golfnow_slug'>,
  date: string,
  slotBookingUrl?: string | null
): string {
  const normalizedSlotUrl = normalizeBookingUrl(slotBookingUrl)
  if (isUsefulSlotBookingUrl(normalizedSlotUrl)) return normalizedSlotUrl!

  const integration = BOOKING_INTEGRATIONS[course.slug]
  if (integration) {
    if (integration.provider === 'teeitup') {
      return `${integration.url}?course=${encodeURIComponent(integration.course)}&date=${date}`
    }
    if (integration.provider === 'chronogolf' || integration.provider === 'teesnap') {
      return withDateParam(integration.url, date)
    }
    return integration.url
  }

  return getGolfNowSearchUrl(course, date) || getCourseFallbackUrl(course)
}

function toIsoDate(date: Date) {
  return date.toISOString().split('T')[0]
}

function toForeUpDate(date: string) {
  const [year, month, day] = date.split('-')
  return `${month}-${day}-${year}`
}

function toHHMM(value: string) {
  const timePart = value.includes(' ') ? value.split(' ')[1] : value
  return timePart.slice(0, 5)
}

function numberValue(value: unknown, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

// Fetch tee times for a single course on a single date via GolfNow API
async function fetchGolfNowTeeTimes(
  facilityId: string,
  golfnowSlug: string,
  date: string // YYYY-MM-DD
): Promise<VerifiedTeeTime[]> {
  const [year, month, day] = date.split('-')
  const formattedDate = `${month}/${day}/${year}`

  // Try the JSON API endpoint first
  const apiUrl = `https://api.golfnow.com/v1/search/tee-times?facilityId=${facilityId}&date=${formattedDate}&holes=18&players=0&time=all`

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://www.golfnow.com/',
        'Origin': 'https://www.golfnow.com',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      // Fall back to scraping the HTML page
      return await scrapeGolfNowPage(facilityId, golfnowSlug, date)
    }

    const data = await response.json()
    return parseGolfNowApiResponse(data, facilityId, golfnowSlug)
  } catch {
    return await scrapeGolfNowPage(facilityId, golfnowSlug, date)
  }
}

function parseGolfNowApiResponse(
  data: unknown,
  facilityId: string,
  golfnowSlug: string
): VerifiedTeeTime[] {
  // Handle various GolfNow API response shapes
  const teeTimes: VerifiedTeeTime[] = []

  if (!data || typeof data !== 'object') return teeTimes

  const d = data as Record<string, unknown>
  const slots: unknown[] = (d.TeeTimes as unknown[]) ||
    (d.teetimes as unknown[]) ||
    (d.Results as unknown[]) ||
    []

  for (const slot of slots) {
    if (!slot || typeof slot !== 'object') continue
    const s = slot as Record<string, unknown>

    const time = (s.Time || s.time || s.StartTime || '') as string
    const players = ((s.Players || s.players || s.MaxPlayers || 4) as number)
    const holes = ((s.Holes || s.holes || 18) as number)
    const cartRequired = ((s.CartRequired || s.cartRequired || false) as boolean)

    const rates = (s.Rates || s.rates || []) as Array<Record<string, unknown>>
    const firstRate = rates[0] || {}
    const greenFee = ((firstRate.GreenFee || firstRate.greenFee || 0) as number)
    const cartFee = ((firstRate.CartFee || firstRate.cartFee || 0) as number)
    const totalFee = ((firstRate.TotalFee || firstRate.totalFee || greenFee + cartFee) as number)
    const bookingUrl = normalizeBookingUrl(
      (s.BookingUrl || s.bookingUrl || s.booking_url || s.Url || s.url || '') as string
    )

    if (time && totalFee > 0) {
      teeTimes.push({
        time,
        players,
        holes,
        price: totalFee,
        cartIncluded: cartRequired,
        walkingAllowed: !cartRequired,
        bookingUrl: bookingUrl ||
          `https://www.golfnow.com/tee-times/facility/${facilityId}-${golfnowSlug}/search`,
        source: 'golfnow',
      })
    }
  }

  return teeTimes
}

// Scrape GolfNow HTML page as fallback using fetch + regex
async function scrapeGolfNowPage(
  facilityId: string,
  golfnowSlug: string,
  date: string
): Promise<VerifiedTeeTime[]> {
  const [year, month, day] = date.split('-')
  const formattedDate = `${month}%2F${day}%2F${year}`

  const url = `https://www.golfnow.com/tee-times/facility/${facilityId}-${golfnowSlug}/search?date=${formattedDate}&holes=18&players=0&time=all&sortby=Time`

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) return []
    if (response.url && !response.url.includes(`/facility/${facilityId}-`)) return []

    const html = await response.text()

    // Extract JSON data embedded in Next.js __NEXT_DATA__ script tag
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1])
        const teeTimesData = nextData?.props?.pageProps?.teeTimes ||
          nextData?.props?.pageProps?.initialData?.teeTimes ||
          []
        if (teeTimesData.length > 0) {
          return parseGolfNowApiResponse({ TeeTimes: teeTimesData }, facilityId, golfnowSlug)
        }
      } catch { /* fall through */ }
    }

    // Last resort: parse tee time data from inline window.__data__ or similar
    const dataMatch = html.match(/window\.__(?:INITIAL_STATE|data|teeTimes)__\s*=\s*({[\s\S]*?});/)
    if (dataMatch) {
      try {
        const data = JSON.parse(dataMatch[1])
        return parseGolfNowApiResponse(data, facilityId, golfnowSlug)
      } catch { /* ignore */ }
    }

    return []
  } catch (err) {
    console.error(`Scrape error for facility ${facilityId}:`, err)
    return []
  }
}

async function fetchForeUpTeeTimes(
  integration: Extract<BookingIntegration, { provider: 'foreup' }>,
  date: string
): Promise<VerifiedTeeTime[]> {
  const page = await fetch(integration.url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(15000),
  })

  if (!page.ok) return []
  const html = await page.text()
  const defaultFilter = extractForeUpJson<Record<string, unknown>>(html, 'DEFAULT_FILTER')
  const schedules = extractForeUpJson<Array<Record<string, unknown>>>(html, 'SCHEDULES') || []
  const schedule = schedules.find((s) => s.selected === true) || schedules[0]
  if (!schedule || !defaultFilter) return []

  const bookingClasses = Array.isArray(schedule.booking_classes)
    ? schedule.booking_classes as Array<Record<string, unknown>>
    : []
  const publicClass = bookingClasses.find((bookingClass) => (
    bookingClass.hidden !== '1' &&
    bookingClass.block_online_booking !== '1' &&
    bookingClass.online_booking_protected !== '1' &&
    /public|guest|standard/i.test(String(bookingClass.name || ''))
  )) || bookingClasses.find((bookingClass) => (
    bookingClass.hidden !== '1' &&
    bookingClass.block_online_booking !== '1' &&
    bookingClass.online_booking_protected !== '1'
  ))

  if (!publicClass) return []

  const scheduleId = String(schedule.teesheet_id || defaultFilter.schedule_id || '')
  const bookingClassId = String(publicClass.booking_class_id || '')
  const courseId = String(schedule.course_id || defaultFilter.course_id || '')
  if (!scheduleId || !bookingClassId || !courseId) return []

  const holeOptions = String(publicClass.limit_holes || defaultFilter.holes || '18') === '0'
    ? [18, 9]
    : [numberValue(publicClass.limit_holes || defaultFilter.holes, 18), 9]
  const slots = []

  for (const holes of [...new Set(holeOptions)]) {
    const query = new URLSearchParams({
      time: 'all',
      date: toForeUpDate(date),
      holes: String(holes),
      players: '1',
      booking_class: bookingClassId,
      schedule_id: scheduleId,
      api_key: '',
    })
    query.append('schedule_ids[]', scheduleId)

    const apiUrl = `https://foreupsoftware.com/index.php/api/booking/times?${query.toString()}`
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': integration.url,
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) continue
    const data = await response.json()
    if (Array.isArray(data)) slots.push(...data)
  }

  const seen = new Set<string>()
  return slots
    .filter((slot) => slot && typeof slot === 'object')
    .map((slot) => {
      const s = slot as Record<string, unknown>
      const holes = numberValue(s.holes, numberValue(defaultFilter.holes, 18))
      const greenFee = holes === 9
        ? numberValue(s.green_fee_9, numberValue(s.green_fee, 0))
        : numberValue(s.green_fee_18, numberValue(s.green_fee, 0))
      const cartFee = holes === 9
        ? numberValue(s.cart_fee_9, numberValue(s.cart_fee, 0))
        : numberValue(s.cart_fee_18, numberValue(s.cart_fee, 0))
      const bookingCarts = publicClass.booking_carts === '1' || s.rate_type === 'riding'
      return {
        time: toHHMM(String(s.time || '')),
        players: numberValue(s.available_spots, 1),
        holes,
        price: greenFee + (bookingCarts ? cartFee : 0),
        cartIncluded: bookingCarts,
        walkingAllowed: !bookingCarts,
        bookingUrl: integration.url,
        source: 'foreup' as const,
      }
    })
    .filter((slot) => {
      const key = `${slot.time}:${slot.holes}`
      if (!slot.time || slot.price <= 0 || slot.players <= 0 || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function extractForeUpJson<T>(html: string, variableName: string): T | null {
  const marker = `${variableName} = `
  const start = html.indexOf(marker)
  if (start === -1) return null
  const valueStart = start + marker.length
  const end = html.indexOf(';\n', valueStart)
  if (end === -1) return null
  try {
    return JSON.parse(html.slice(valueStart, end)) as T
  } catch {
    return null
  }
}

async function fetchProviderTeeTimes(course: Course, date: string): Promise<VerifiedTeeTime[]> {
  const integration = BOOKING_INTEGRATIONS[course.slug]
  if (integration?.provider === 'foreup') {
    return fetchForeUpTeeTimes(integration, date)
  }

  if (course.golfnow_facility_id && course.golfnow_slug) {
    return fetchGolfNowTeeTimes(course.golfnow_facility_id, course.golfnow_slug, date)
  }

  return []
}

// Main scrape function — runs for all courses, next N days
export async function scrapeAllCourses(daysAhead = SCRAPE_DAYS_AHEAD) {
  const logEntry = await supabaseAdmin
    .from('scrape_logs')
    .insert({ started_at: new Date().toISOString() })
    .select()
    .single()

  const logId = logEntry.data?.id
  const errors: Array<{ course: string; error: string }> = []
  let totalFound = 0
  let totalInserted = 0

  // Get all courses from DB
  const { data: courses, error: coursesError } = await supabaseAdmin
    .from('courses')
    .select('*')

  if (coursesError || !courses) {
    console.error('Failed to fetch courses:', coursesError)
    return { found: 0, inserted: 0, errors: ['Failed to fetch courses'] }
  }

  const dates = getDatesToScrape(daysAhead)

  for (const course of courses as Course[]) {
    if (SUPPORTED_COURSE_SLUGS.size > 0 && !SUPPORTED_COURSE_SLUGS.has(course.slug)) continue

    for (const date of dates) {
      try {
        const teeTimes = await fetchProviderTeeTimes(course, date)

        await deleteCourseDateRows(course.id, date)
        if (teeTimes.length === 0) {
          continue
        }

        const rows = teeTimes.map((tt) => ({
          course_id: course.id,
          tee_date: date,
          tee_time: tt.time,
          holes: tt.holes,
          available_spots: tt.players,
          price_per_player: tt.price,
          cart_included: tt.cartIncluded,
          walking_allowed: tt.walkingAllowed,
          booking_url: getCourseBookingUrl(course, date, tt.bookingUrl),
          source: tt.source,
          scraped_at: new Date().toISOString(),
        }))

        totalFound += rows.length

        const { error: insertError } = await supabaseAdmin
          .from('tee_times')
          .insert(rows)

        if (insertError) {
          errors.push({ course: course.name, error: insertError.message })
        } else {
          totalInserted += rows.length
        }

        // Rate limit — be polite
        await sleep(500)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push({ course: course.name, error: msg })
      }
    }
  }

  // Delete stale tee times (past dates + very old scrapes)
  await supabaseAdmin
    .from('tee_times')
    .delete()
    .lt('tee_date', new Date().toISOString().split('T')[0])

  await supabaseAdmin
    .from('tee_times')
    .delete()
    .lt('scraped_at', new Date(Date.now() - FRESH_TEE_TIME_WINDOW_MINUTES * 60 * 1000).toISOString())

  // Update log
  if (logId) {
    await supabaseAdmin
      .from('scrape_logs')
      .update({
        finished_at: new Date().toISOString(),
        courses_attempted: courses.length,
        tee_times_found: totalFound,
        tee_times_inserted: totalInserted,
        errors,
      })
      .eq('id', logId)
  }

  return { found: totalFound, inserted: totalInserted, errors }
}

async function deleteCourseDateRows(courseId: string, date: string) {
  await supabaseAdmin
    .from('tee_times')
    .delete()
    .eq('course_id', courseId)
    .eq('tee_date', date)
    .neq('source', 'demo')
}

function getDatesToScrape(daysAhead: number): string[] {
  const dates = []
  const today = new Date()
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    dates.push(toIsoDate(d))
  }
  return dates
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Query tee times from DB — called by Claude tool use
export async function queryTeeTimes(params: {
  lat?: number
  lng?: number
  radius_miles?: number
  date?: string
  date_start?: string
  date_end?: string
  time_start?: string
  time_end?: string
  holes?: number
  max_price?: number
  players?: number
  course_ids?: string[]
}) {
  const verified = await fetchTeeTimesFromDb(params, false)

  if (verified.error) {
    console.warn('queryTeeTimes DB error:', verified.error)
    return []
  }

  return verified.results.map((tt) => {
    if (!tt.course) return tt
    return {
      ...tt,
      booking_url: getCourseBookingUrl(
        tt.course,
        tt.tee_date,
        tt.booking_url
      ),
    }
  })
}

async function fetchTeeTimesFromDb(
  params: Parameters<typeof queryTeeTimes>[0],
  includeDemo: boolean
) {
  let query = supabaseAdmin
    .from('tee_times')
    .select(`
      *,
      course:courses(*)
    `)
    .gte('tee_date', params.date || params.date_start || new Date().toISOString().split('T')[0])
    .gte('scraped_at', new Date(Date.now() - FRESH_TEE_TIME_WINDOW_MINUTES * 60 * 1000).toISOString())
    .order('tee_date', { ascending: true })
    .order('tee_time', { ascending: true })
    .limit(200)

  query = includeDemo ? query : query.neq('source', 'demo')

  if (params.date) {
    query = query.eq('tee_date', params.date)
  } else if (params.date_end) {
    query = query.lte('tee_date', params.date_end)
  }

  if (params.time_start) {
    query = query.gte('tee_time', params.time_start)
  }
  if (params.time_end) {
    query = query.lte('tee_time', params.time_end)
  }
  if (params.holes) {
    query = query.eq('holes', params.holes)
  }
  if (params.max_price) {
    query = query.lte('price_per_player', params.max_price)
  }
  if (params.players) {
    query = query.gte('available_spots', params.players)
  }
  if (params.course_ids && params.course_ids.length > 0) {
    query = query.in('course_id', params.course_ids)
  }

  const { data, error } = await query
  if (error) return { results: [], error: error.message }

  let results = data || []

  // Filter by distance if lat/lng provided. Supabase does the cheap filtering first;
  // the final radius trim needs course coordinates from the joined row.
  if (params.lat && params.lng && results.length > 0) {
    const radius = params.radius_miles || 25
    results = results.filter((tt) => {
      const course = tt.course as { lat: number; lng: number } | null
      if (!course) return false
      const dist = haversineDistanceMiles(params.lat!, params.lng!, course.lat, course.lng)
      return dist <= radius
    })
  }

  return { results: results.slice(0, 20), error: null }
}

export function haversineDistanceMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 3958.8 // Earth radius in miles
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}
