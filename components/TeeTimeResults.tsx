'use client'

import type { TeeTime } from '@/types'
import { formatTime, formatDate } from '@/lib/utils'

interface Props {
  teeTimes: TeeTime[]
  totalCount: number
}

export function TeeTimeResults({ teeTimes, totalCount }: Props) {
  if (teeTimes.length === 0) return null

  return (
    <div className="mt-2 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          {totalCount} option{totalCount !== 1 ? 's' : ''} found
        </p>
        {totalCount > teeTimes.length && (
          <p className="text-[11px] text-gray-400">
            showing top {teeTimes.length} · ask to refine
          </p>
        )}
      </div>

      {/* Result rows */}
      <div className="space-y-1.5">
        {teeTimes.map((tt, i) => {
          const course = tt.course
          return (
            <ResultRow key={tt.id} teeTime={tt} rank={i + 1} />
          )
        })}
      </div>
    </div>
  )
}

function ResultRow({ teeTime, rank }: { teeTime: TeeTime; rank: number }) {
  const course = teeTime.course

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3.5 py-3 hover:border-green-200 hover:shadow-sm transition-all">
      {/* Rank */}
      <span className="shrink-0 text-[11px] font-bold text-gray-300 w-4 text-center">{rank}</span>

      {/* Course + location */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900 leading-tight">{course?.name}</p>
        <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{course?.city}</p>
      </div>

      {/* Date + time */}
      <div className="shrink-0 text-center">
        <p className="text-xs font-semibold text-gray-700">{formatTime(teeTime.tee_time)}</p>
        <p className="text-[11px] text-gray-400">{formatDate(teeTime.tee_date)}</p>
      </div>

      {/* Tags */}
      <div className="shrink-0 hidden sm:flex flex-col items-end gap-1">
        <span className="text-[11px] rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
          {teeTime.holes}h
        </span>
        <span className={`text-[11px] rounded-full px-2 py-0.5 ${teeTime.walking_allowed ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
          {teeTime.walking_allowed ? 'Walk' : 'Cart'}
        </span>
      </div>

      {/* Price + CTA */}
      <div className="shrink-0 flex flex-col items-end gap-1.5">
        <p className="text-base font-bold text-green-700 leading-none">${teeTime.price_per_player}</p>
        <a
          href={teeTime.booking_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-semibold bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
        >
          Reserve →
        </a>
      </div>
    </div>
  )
}
