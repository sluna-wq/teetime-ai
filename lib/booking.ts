import type { BookingCapability, BookingProvider, TeeTime } from '@/types'

export const BOOKING_PROVIDER_LABELS: Record<BookingProvider, string> = {
  golfnow: 'GolfNow',
  webtrac: 'WebTrac',
  cps: 'CPS',
  foreup: 'foreUP',
  northstar: 'Northstar',
  teeitup: 'Tee It Up',
  chronogolf: 'Chronogolf',
  teesnap: 'TeeSnap',
  teequest: 'TeeQuest',
  clubcaddie: 'Club Caddie',
  course_direct: 'Course direct',
  phone: 'Phone',
}

export function getBookingProviderLabel(provider?: BookingProvider | null) {
  return provider ? BOOKING_PROVIDER_LABELS[provider] : 'Course direct'
}

export function getBookingCapability(teeTime: TeeTime): BookingCapability {
  if (teeTime.source === 'demo') return 'agent_required'
  if (teeTime.course?.booking_capability) return teeTime.course.booking_capability
  if (teeTime.source === 'golfnow') return 'deep_link_to_date'
  return 'booking_engine_landing'
}

export function getBookingButtonLabel(teeTime: TeeTime) {
  const capability = getBookingCapability(teeTime)

  if (teeTime.source === 'demo') return 'Check live'
  if (capability === 'phone_only') return 'Call course'
  if (capability === 'deep_link_to_date') return 'Reserve'
  if (capability === 'booking_engine_landing') return 'Open booking'
  if (capability === 'manual_date_selection') return 'Open booking'
  if (capability === 'blocked_in_headless') return 'Open booking'
  if (capability === 'course_policy_page') return 'Booking info'
  return 'Open booking'
}

export function getBookingTone(teeTime: TeeTime): 'strong' | 'neutral' | 'manual' {
  const capability = getBookingCapability(teeTime)
  if (teeTime.source === 'demo' || capability === 'agent_required' || capability === 'blocked_in_headless') {
    return 'manual'
  }
  if (capability === 'deep_link_to_date') return 'strong'
  return 'neutral'
}

export function getBookingBadgeLabel(teeTime: TeeTime) {
  if (teeTime.source === 'demo') return 'Verify live'
  const provider = teeTime.course?.booking_provider
  return getBookingProviderLabel(provider)
}
