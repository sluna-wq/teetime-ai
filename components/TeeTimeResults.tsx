'use client'

import { useState, useMemo } from 'react'
import type { TeeTime } from '@/types'
import { formatTime, formatDate } from '@/lib/utils'

interface Props {
  teeTimes: TeeTime[]   // full result set from last search
  totalCount: number
}

type SortKey = 'default' | 'price_asc' | 'time_asc' | 'time_desc'
type Filter = 'walking' | 'under40' | 'under55' | '18holes' | '9holes'

const FILTER_LABELS: Record<Filter, string> = {
  walking:  'Walking',
  under40:  'Under $40',
  under55:  'Under $55',
  '18holes': '18 holes',
  '9holes':  '9 holes',
}

const SORT_LABELS: Record<SortKey, string> = {
  default:   'Best match',
  price_asc: 'Cheapest first',
  time_asc:  'Earliest first',
  time_desc: 'Latest first',
}

const PAGE = 3   // initial visible count

export function TeeTimeResults({ teeTimes, totalCount }: Props) {
  const [activeFilters, setActiveFilters] = useState<Set<Filter>>(new Set())
  const [sort, setSort] = useState<SortKey>('default')
  const [showAll, setShowAll] = useState(false)

  // Reset expand when new results arrive
  const [prevLength, setPrevLength] = useState(teeTimes.length)
  if (teeTimes.length !== prevLength) {
    setShowAll(false)
    setActiveFilters(new Set())
    setSort('default')
    setPrevLength(teeTimes.length)
  }

  const toggleFilter = (f: Filter) => {
    setShowAll(false)
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else {
        // price filters are mutually exclusive
        if (f === 'under40' || f === 'under55') { next.delete('under40'); next.delete('under55') }
        // hole filters are mutually exclusive
        if (f === '18holes' || f === '9holes') { next.delete('18holes'); next.delete('9holes') }
        next.add(f)
      }
      return next
    })
  }

  const filtered = useMemo(() => {
    let list = [...teeTimes]
    if (activeFilters.has('walking'))  list = list.filter((t) => t.walking_allowed)
    if (activeFilters.has('under40'))  list = list.filter((t) => t.price_per_player <= 40)
    if (activeFilters.has('under55'))  list = list.filter((t) => t.price_per_player <= 55)
    if (activeFilters.has('18holes'))  list = list.filter((t) => t.holes === 18)
    if (activeFilters.has('9holes'))   list = list.filter((t) => t.holes === 9)
    if (sort === 'price_asc') list.sort((a, b) => a.price_per_player - b.price_per_player)
    if (sort === 'time_asc')  list.sort((a, b) => a.tee_time.localeCompare(b.tee_time))
    if (sort === 'time_desc') list.sort((a, b) => b.tee_time.localeCompare(a.tee_time))
    return list
  }, [teeTimes, activeFilters, sort])

  const visible = showAll ? filtered : filtered.slice(0, PAGE)
  const hiddenCount = filtered.length - PAGE

  if (teeTimes.length === 0) return null

  return (
    <div className="w-full mt-1">
      {/* Filter bar */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => toggleFilter(f)}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all ${
              activeFilters.has(f)
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        <div className="ml-auto">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] text-gray-500 outline-none cursor-pointer hover:border-gray-300"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((s) => (
              <option key={s} value={s}>{SORT_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Result count */}
      <p className="text-[11px] text-gray-400 mb-1.5">
        {filtered.length === 0
          ? 'No results match those filters'
          : `${filtered.length} of ${totalCount} options`}
      </p>

      {/* Rows */}
      <div className="space-y-1.5">
        {visible.map((tt, i) => (
          <ResultRow key={tt.id} teeTime={tt} rank={i + 1} />
        ))}
      </div>

      {/* Show more / less */}
      {!showAll && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 w-full rounded-xl border border-dashed border-gray-200 py-2 text-[12px] font-medium text-gray-500 hover:border-green-400 hover:text-green-700 transition-colors"
        >
          Show {hiddenCount} more option{hiddenCount !== 1 ? 's' : ''} ↓
        </button>
      )}
      {showAll && filtered.length > PAGE && (
        <button
          onClick={() => setShowAll(false)}
          className="mt-2 w-full rounded-xl border border-dashed border-gray-200 py-2 text-[12px] font-medium text-gray-400 hover:border-gray-300 transition-colors"
        >
          Show less ↑
        </button>
      )}
    </div>
  )
}

function ResultRow({ teeTime, rank }: { teeTime: TeeTime; rank: number }) {
  const course = teeTime.course
  const isUnverified = teeTime.source === 'demo'
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3.5 py-2.5 hover:border-green-200 hover:shadow-sm transition-all">
      <span className="shrink-0 text-[11px] font-bold text-gray-300 w-4 text-center">{rank}</span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-gray-900 leading-tight">{course?.name}</p>
        <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{course?.city}</p>
      </div>

      <div className="shrink-0 text-center">
        <p className="text-[13px] font-semibold text-gray-700">{formatTime(teeTime.tee_time)}</p>
        <p className="text-[11px] text-gray-400">{formatDate(teeTime.tee_date)}</p>
      </div>

      <div className="shrink-0 hidden sm:flex flex-col items-end gap-0.5">
        <span className="text-[10px] rounded-full bg-gray-100 px-1.5 py-0.5 text-gray-500">{teeTime.holes}h</span>
        <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${teeTime.walking_allowed ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
          {teeTime.walking_allowed ? 'Walk ✓' : 'Cart'}
        </span>
      </div>

      <div className="shrink-0 flex flex-col items-end gap-1">
        <p className="text-[15px] font-bold text-green-700 leading-none">${teeTime.price_per_player}</p>
        <a
          href={teeTime.booking_url}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-[11px] font-semibold text-white px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
            isUnverified ? 'bg-gray-800 hover:bg-gray-900' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isUnverified ? 'Check live ->' : 'Reserve ->'}
        </a>
      </div>
    </div>
  )
}
