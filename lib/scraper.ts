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

const FRESH_TEE_TIME_WINDOW_MINUTES = Number(process.env.TEE_TIME_FRESH_MINUTES || 45)
const SCRAPE_DAYS_AHEAD = Number(process.env.SCRAPE_DAYS_AHEAD || 15)
const MAX_SCRAPE_DAYS_AHEAD = Number(process.env.MAX_SCRAPE_DAYS_AHEAD || 7)
const SCRAPE_COURSE_BATCH_SIZE = Number(process.env.SCRAPE_COURSE_BATCH_SIZE || 6)
const DEFAULT_SUPPORTED_COURSE_SLUGS = [
  'putterham-meadows',
  'furnace-brook',
  'widows-walk',
  'braintree-municipal',
  'presidents',
]
const SUPPORTED_COURSE_SLUGS = new Set(
  (process.env.SUPPORTED_COURSE_SLUGS || DEFAULT_SUPPORTED_COURSE_SLUGS.join(','))
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)
)

const VERIFIED_GOLFNOW_FACILITIES: Record<string, { facilityId: string; slug: string }> = {
  'braintree-municipal': { facilityId: '16026', slug: 'braintree-municipal-golf-course' },
  'presidents': { facilityId: '17943', slug: 'presidents-golf-course' },
  'widows-walk': { facilityId: '18419', slug: 'widows-walk-golf-course' },
}

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

async function fetchGolfNowTeeTimes(
  course: Course,
  facilityId: string,
  golfnowSlug: string,
  date: string
): Promise<VerifiedTeeTime[]> {
  const [year, month, day] = date.split('-')
  const golfNowDate = new Date(Number(year), Number(month) - 1, Number(day))
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  try {
    const response = await fetch('https://www.golfnow.com/api/tee-times/tee-time-search-results', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': `https://www.golfnow.com/tee-times/facility/${facilityId}-${golfnowSlug}/search`,
      },
      body: JSON.stringify({
        useWidgetNextAvailableDays: null,
        nextAvailableTeeTime: null,
        tags: null,
        address: null,
        pageSize: 100,
        teeTimeCount: 100,
        pageNumber: 0,
        date: golfNowDate,
        sortBy: 'Date',
        sortByRollup: 'Date.MinDate',
        sortDirection: 'Asc',
        hotDealsOnly: false,
        golfPassPerksOnly: false,
        bestDealsOnly: false,
        promotedCampaignsOnly: false,
        priceMin: 0,
        priceMax: 10000,
        players: 0,
        timePeriod: 'Any',
        timeMin: 10,
        timeMax: 42,
        holes: 'Any',
        facilityType: 'GolfCourse',
        latitude: course.lat,
        longitude: course.lng,
        radius: 35,
        maxAllowedRadius: null,
        facilityId: Number(facilityId),
        facilityIds: [],
        marketId: null,
        marketName: null,
        searchType: 'Facility',
        view: 'Grouping',
        nonGPS: null,
        excludeFeaturedFacilities: true,
        excludePrivateFacilities: false,
        rateTagCodes: null,
        customerToken: null,
        rateType: 'all',
        currentClientDate: new Date().toISOString(),
        daysToSearch: null,
        facilityTagsExclusive: null,
        isSimulator: null,
        isHotDealsZoneMoreDeals: null,
        facilityGroupId: null,
        trackmanOnly: false,
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) return []
    return parseGolfNowSearchResponse(await response.json(), course, facilityId)
  } catch (err) {
    console.error(`Scrape error for facility ${facilityId}:`, err)
    return []
  }
}

function parseGolfNowSearchResponse(data: unknown, course: Course, facilityId: string): VerifiedTeeTime[] {
  if (!data || typeof data !== 'object') return []

  const d = data as Record<string, unknown>
  const results = d.ttResults as Record<string, unknown> | undefined
  const teeTimes = Array.isArray(results?.teeTimes) ? results.teeTimes : []

  return teeTimes
    .map((slot) => parseGolfNowSlot(slot, course, facilityId))
    .filter((slot): slot is VerifiedTeeTime => Boolean(slot))
}

function parseGolfNowSlot(slot: unknown, course: Course, facilityId: string): VerifiedTeeTime | null {
  if (!slot || typeof slot !== 'object') return null
  const s = slot as Record<string, unknown>
  const facility = s.facility as Record<string, unknown> | undefined
  if (String(facility?.facilityId || s.facilityId || '') !== facilityId) return null
  if (!isExpectedGolfNowFacilityName(String(facility?.name || ''), course.name)) return null

  const rates = Array.isArray(s.teeTimeRates) ? s.teeTimeRates as Array<Record<string, unknown>> : []
  const rate = rates[0]
  const time = parseGolfNowTime(s.time)
  const holes = numberValue(rate?.holeCount, 18)
  const price = numberValue((s.displayRate as Record<string, unknown> | undefined)?.value,
    numberValue((rate?.singlePlayerPrice as Record<string, unknown> | undefined)?.greensFees &&
      ((rate?.singlePlayerPrice as Record<string, unknown>).greensFees as Record<string, unknown>).value, 0))
  const bookingUrl = normalizeBookingUrl(String(s.detailUrl || rate?.detailUrl || '')) ||
    `https://www.golfnow.com/tee-times/facility/${facilityId}/tee-time/${s.defaultTeeTimeRateId || rate?.teeTimeRateId}`

  if (!time || holes <= 0 || price <= 0 || !bookingUrl) return null

  return {
    time,
    players: maxPlayersFromRule(String(s.playerRule || rate?.playerRule || 'Any')),
    holes,
    price,
    cartIncluded: rate?.isCartIncluded === true || String(rate?.transportation || '').toLowerCase().includes('cart'),
    walkingAllowed: rate?.isCartIncluded !== true,
    bookingUrl,
    source: 'golfnow',
  }
}

function parseGolfNowTime(value: unknown) {
  const time = value as Record<string, unknown> | undefined
  const formatted = String(time?.formatted || '')
  const meridian = String(time?.formattedTimeMeridian || '')
  if (!formatted) return ''
  const [hourRaw, minuteRaw = '00'] = formatted.split(':')
  let hour = Number(hourRaw)
  if (!Number.isFinite(hour)) return ''
  if (/pm/i.test(meridian) && hour < 12) hour += 12
  if (/am/i.test(meridian) && hour === 12) hour = 0
  return `${String(hour).padStart(2, '0')}:${minuteRaw.padStart(2, '0')}`
}

function maxPlayersFromRule(rule: string) {
  if (!rule || /any/i.test(rule)) return 4
  const values: Record<string, number> = { One: 1, Two: 2, Three: 3, Four: 4 }
  return Object.entries(values).reduce((max, [word, value]) => (
    rule.includes(word) ? Math.max(max, value) : max
  ), 1)
}

function isExpectedGolfNowFacilityName(actual: string, expected: string) {
  const normalize = (value: string) => value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(golf|course|club|municipal|at|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const a = normalize(actual)
  const e = normalize(expected)
  return Boolean(a && e && (a.includes(e) || e.includes(a) || tokenOverlap(a, e) >= 2))
}

function tokenOverlap(a: string, b: string) {
  const left = new Set(a.split(' ').filter(Boolean))
  return b.split(' ').filter((token) => left.has(token)).length
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
  const golfNow = VERIFIED_GOLFNOW_FACILITIES[course.slug]
  const providerResults = await Promise.all([
    golfNow
      ? fetchGolfNowTeeTimes(course, golfNow.facilityId, golfNow.slug, date)
      : Promise.resolve([]),
    integration?.provider === 'foreup'
      ? fetchForeUpTeeTimes(integration, date)
      : Promise.resolve([]),
  ])

  const merged = mergeVerifiedTeeTimes(providerResults.flat())
  if (merged.length > 0) return merged

  return []
}

function mergeVerifiedTeeTimes(slots: VerifiedTeeTime[]) {
  const byTime = new Map<string, VerifiedTeeTime>()
  for (const slot of slots) {
    const key = `${slot.time}:${slot.holes}`
    const existing = byTime.get(key)
    if (!existing || (slot.source === 'golfnow' && existing.source !== 'golfnow')) {
      byTime.set(key, slot)
    }
  }
  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time) || a.holes - b.holes)
}

// Main scrape function — runs for all courses, next N days
export async function scrapeAllCourses(daysAhead = SCRAPE_DAYS_AHEAD, courseSlugs?: string[]) {
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

  const effectiveDaysAhead = Math.max(0, Math.min(daysAhead, MAX_SCRAPE_DAYS_AHEAD))
  const dates = getDatesToScrape(effectiveDaysAhead)

  const explicitCourseSlugs = new Set(courseSlugs?.filter(Boolean) || [])
  const targetCourses = (courses as Course[]).filter((course) => {
    if (explicitCourseSlugs.size > 0) return explicitCourseSlugs.has(course.slug)
    if (SUPPORTED_COURSE_SLUGS.size > 0) return SUPPORTED_COURSE_SLUGS.has(course.slug)
    return true
  })
  const coursesToScrape = explicitCourseSlugs.size > 0
    ? targetCourses
    : await chooseCoursesForThisRun(targetCourses)

  for (const course of coursesToScrape) {

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
        courses_attempted: coursesToScrape.length,
        tee_times_found: totalFound,
        tee_times_inserted: totalInserted,
        errors,
      })
      .eq('id', logId)
  }

  return { found: totalFound, inserted: totalInserted, errors }
}

async function chooseCoursesForThisRun(courses: Course[]) {
  if (SCRAPE_COURSE_BATCH_SIZE <= 0 || courses.length <= SCRAPE_COURSE_BATCH_SIZE) return courses

  const latestScrapes = await getLatestScrapeByCourse()
  return [...courses]
    .sort((a, b) => {
      const aLatest = latestScrapes.get(a.id) || 0
      const bLatest = latestScrapes.get(b.id) || 0
      if (aLatest !== bLatest) return aLatest - bLatest
      return a.name.localeCompare(b.name)
    })
    .slice(0, SCRAPE_COURSE_BATCH_SIZE)
}

async function getLatestScrapeByCourse() {
  const latestByCourse = new Map<string, number>()
  const { data } = await supabaseAdmin
    .from('tee_times')
    .select('course_id, scraped_at')
    .neq('source', 'demo')
    .gte('tee_date', new Date().toISOString().split('T')[0])
    .order('scraped_at', { ascending: false })
    .limit(1000)

  for (const row of data || []) {
    if (!row.course_id || !row.scraped_at || latestByCourse.has(row.course_id)) continue
    latestByCourse.set(row.course_id, new Date(row.scraped_at).getTime())
  }
  return latestByCourse
}

async function deleteCourseDateRows(courseId: string, date: string) {
  await supabaseAdmin
    .from('tee_times')
    .delete()
    .eq('course_id', courseId)
    .eq('tee_date', date)
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
