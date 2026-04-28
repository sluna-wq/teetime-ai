'use client'

import { formatTime, formatDate } from '@/lib/utils'
import type { TeeTime } from '@/types'

interface Props {
  teeTime: TeeTime
  isHighlighted?: boolean
}

export function TeeTimeCard({ teeTime, isHighlighted }: Props) {
  const course = teeTime.course

  return (
    <div
      className={`rounded-xl border bg-white p-4 transition-all ${
        isHighlighted ? 'border-green-500 shadow-md shadow-green-100 ring-1 ring-green-500' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900">{course?.name}</p>
          <p className="text-sm text-gray-500">{course?.city}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-bold text-green-700">${teeTime.price_per_player}</p>
          <p className="text-xs text-gray-400">per player</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 font-medium">
          <CalendarIcon />
          {formatDate(teeTime.tee_date)}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 font-medium">
          <ClockIcon />
          {formatTime(teeTime.tee_time)}
        </span>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium">
          {teeTime.holes} holes
        </span>
        {teeTime.walking_allowed && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 font-medium">
            Walking
          </span>
        )}
        {teeTime.cart_included && (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700 font-medium">
            Cart incl.
          </span>
        )}
        <span className="rounded-full bg-gray-100 px-2.5 py-1">
          {teeTime.available_spots} {teeTime.available_spots === 1 ? 'spot' : 'spots'}
        </span>
      </div>

      <a
        href={teeTime.booking_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 active:bg-green-800"
      >
        Reserve
        <ExternalLinkIcon />
      </a>
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}
