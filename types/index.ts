export type BookingProvider =
  | 'golfnow'
  | 'webtrac'
  | 'cps'
  | 'foreup'
  | 'northstar'
  | 'teeitup'
  | 'chronogolf'
  | 'teesnap'
  | 'teequest'
  | 'clubcaddie'
  | 'course_direct'
  | 'phone'

export type BookingCapability =
  | 'deep_link_to_date'
  | 'booking_engine_landing'
  | 'manual_date_selection'
  | 'agent_required'
  | 'blocked_in_headless'
  | 'course_policy_page'
  | 'phone_only'

export interface Course {
  id: string
  name: string
  slug: string
  address: string
  city: string
  lat: number
  lng: number
  phone: string | null
  website: string | null
  golfnow_facility_id: string | null
  golfnow_slug: string | null
  booking_provider?: BookingProvider | null
  booking_capability?: BookingCapability | null
  booking_notes?: string | null
  holes_available: number[] // [9, 18]
  walking_allowed: boolean
  price_range: string // "$" | "$$" | "$$$"
  price_min: number | null
  price_max: number | null
  description: string | null
  image_url: string | null
  updated_at: string
}

export interface TeeTime {
  id: string
  course_id: string
  course?: Course
  tee_date: string // YYYY-MM-DD
  tee_time: string // HH:MM
  holes: number
  available_spots: number
  price_per_player: number
  cart_included: boolean
  walking_allowed: boolean
  booking_url: string
  source: 'golfnow' | 'foreup' | 'course_direct' | 'demo'
  scraped_at: string
}

export interface Alert {
  id: string
  email: string
  lat: number | null
  lng: number | null
  radius_miles: number
  date_start: string | null
  date_end: string | null
  time_start: string | null // HH:MM
  time_end: string | null
  holes: number | null
  max_price: number | null
  players: number | null
  course_ids: string[] | null
  active: boolean
  fired_count: number
  last_fired_at: string | null
  created_at: string
}

export interface TeeTimeQuery {
  lat?: number
  lng?: number
  radius_miles?: number
  date?: string // YYYY-MM-DD
  date_start?: string
  date_end?: string
  time_start?: string // HH:MM
  time_end?: string
  holes?: number
  max_price?: number
  players?: number
  course_ids?: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
