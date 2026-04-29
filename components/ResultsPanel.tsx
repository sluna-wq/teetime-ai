'use client'

import { useMemo, useState, type ComponentType } from 'react'
import type { Course, TeeTime } from '@/types'
import { formatTime, formatDate, timeAgo } from '@/lib/utils'
import { type Filter, FILTER_LABELS } from '@/lib/filters'
import { getBookingBadgeLabel, getBookingButtonLabel, getBookingTone } from '@/lib/booking'

type SortKey = 'default' | 'price_asc' | 'time_asc' | 'time_desc'

interface MapProps {
  courses: Course[]
  teeTimes: TeeTime[]
  selectedCourseId: string | null
  onCourseSelect: (id: string | null) => void
  userLocation: { lat: number; lng: number } | null
}

interface Props {
  teeTimes: TeeTime[]
  courses: Course[]
  selectedCourseId: string | null
  onCourseSelect: (id: string | null) => void
  userLocation: { lat: number; lng: number } | null
  view: 'list' | 'map'
  onViewChange: (v: 'list' | 'map') => void
  MapComponent: ComponentType<MapProps>
  activeFilters: Set<string>
  onFiltersChange: (f: Set<string>) => void
  recommendedIds: string[]
}

const PAGE = 6

export function ResultsPanel({ teeTimes, courses, selectedCourseId, onCourseSelect, userLocation, view, onViewChange, MapComponent, activeFilters, onFiltersChange, recommendedIds }: Props) {
  const [sort, setSort] = useState<SortKey>('default')
  const [showAll, setShowAll] = useState(false)

  const toggleFilter = (f: Filter) => {
    setShowAll(false)
    const next = new Set(activeFilters)
    if (next.has(f)) {
      next.delete(f)
    } else {
      if (f === 'under40' || f === 'under55') { next.delete('under40'); next.delete('under55') }
      if (f === '18holes' || f === '9holes') { next.delete('18holes'); next.delete('9holes') }
      next.add(f)
    }
    onFiltersChange(next)
  }

  const filtered = useMemo(() => {
    let list = [...teeTimes]
    if (activeFilters.has('walking')) list = list.filter((t) => t.walking_allowed)
    if (activeFilters.has('under40')) list = list.filter((t) => t.price_per_player <= 40)
    if (activeFilters.has('under55')) list = list.filter((t) => t.price_per_player <= 55)
    if (activeFilters.has('18holes')) list = list.filter((t) => t.holes === 18)
    if (activeFilters.has('9holes')) list = list.filter((t) => t.holes === 9)
    if (sort === 'price_asc') list.sort((a, b) => a.price_per_player - b.price_per_player)
    if (sort === 'time_asc') list.sort((a, b) => a.tee_time.localeCompare(b.tee_time))
    if (sort === 'time_desc') list.sort((a, b) => b.tee_time.localeCompare(a.tee_time))
    return list
  }, [teeTimes, activeFilters, sort])

  // Split: Claude's picks (in recommendation order) + the rest
  const { recommended, rest } = useMemo(() => {
    if (recommendedIds.length === 0) return { recommended: [], rest: filtered }
    const recSet = new Set(recommendedIds)
    const recMap = new Map(filtered.map((t) => [t.id, t]))
    const recommended = recommendedIds.map((id) => recMap.get(id)).filter((t): t is TeeTime => !!t)
    const rest = filtered.filter((t) => !recSet.has(t.id))
    return { recommended, rest }
  }, [filtered, recommendedIds])

  const allVisible = [...recommended, ...rest]
  const visible = showAll ? allVisible : allVisible.slice(0, PAGE)
  const visibleIds = new Set(visible.map((t) => t.id))
  const hidden = allVisible.length - PAGE

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-white shrink-0">
        {/* View toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
          {(['list', 'map'] as const).map((v) => (
            <button key={v} onClick={() => onViewChange(v)}
              className={`px-3 py-1 text-[11px] font-medium transition-colors ${view === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {v === 'list' ? '≡ List' : '⊞ Map'}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <button key={f} onClick={() => toggleFilter(f)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all whitespace-nowrap ${
                activeFilters.has(f)
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Sort + count */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] text-gray-500 outline-none cursor-pointer">
            <option value="default">Best match</option>
            <option value="price_asc">Cheapest first</option>
            <option value="time_asc">Earliest first</option>
            <option value="time_desc">Latest first</option>
          </select>
          <span className="text-[11px] text-gray-400 whitespace-nowrap">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Content */}
      {view === 'map' ? (
        <div className="flex-1 p-3">
          <MapComponent
            courses={courses}
            teeTimes={filtered}
            selectedCourseId={selectedCourseId}
            onCourseSelect={onCourseSelect}
            userLocation={userLocation}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {allVisible.length === 0 ? (
            <p className="text-sm text-gray-400 text-center pt-8">No results match those filters</p>
          ) : (
            <>
              {/* Claude's picks section */}
              {recommended.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-green-600 mb-1.5 px-1">
                    ★ Recommended
                  </p>
                  <div className="space-y-2">
                    {recommended.filter((tt) => visibleIds.has(tt.id)).map((tt, i) => (
                      <ResultRow key={tt.id} teeTime={tt} rank={i + 1}
                        isSelected={selectedCourseId === tt.course_id}
                        isRecommended
                        onSelect={() => onCourseSelect(tt.course_id === selectedCourseId ? null : tt.course_id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Divider + rest */}
              {recommended.length > 0 && rest.length > 0 && (
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-[10px] font-medium text-gray-300 uppercase tracking-wide">All results</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              )}

              <div className="space-y-2">
                {rest.filter((tt) => visibleIds.has(tt.id)).map((tt, i) => (
                  <ResultRow key={tt.id} teeTime={tt} rank={recommended.length + i + 1}
                    isSelected={selectedCourseId === tt.course_id}
                    isRecommended={false}
                    onSelect={() => onCourseSelect(tt.course_id === selectedCourseId ? null : tt.course_id)}
                  />
                ))}
              </div>

              {!showAll && hidden > 0 && (
                <button onClick={() => setShowAll(true)}
                  className="mt-3 w-full rounded-xl border border-dashed border-gray-200 py-2.5 text-xs font-medium text-gray-400 hover:border-green-400 hover:text-green-700 transition-colors">
                  Show {hidden} more option{hidden !== 1 ? 's' : ''} ↓
                </button>
              )}
              {showAll && allVisible.length > PAGE && (
                <button onClick={() => setShowAll(false)}
                  className="mt-3 w-full rounded-xl border border-dashed border-gray-200 py-2 text-xs font-medium text-gray-400 hover:border-gray-300 transition-colors">
                  Show less ↑
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ResultRow({ teeTime, rank, isSelected, isRecommended, onSelect }: {
  teeTime: TeeTime; rank: number; isSelected: boolean; isRecommended: boolean; onSelect: () => void
}) {
  const course = teeTime.course
  const bookingTone = getBookingTone(teeTime)
  const bookingLabel = `${getBookingButtonLabel(teeTime)} ->`
  const bookingBadge = getBookingBadgeLabel(teeTime)
  return (
    <div
      onClick={onSelect}
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-3 cursor-pointer transition-all ${
        isSelected
          ? 'border-green-400 bg-green-50 shadow-sm'
          : isRecommended
          ? 'border-green-200 bg-green-50/40 hover:border-green-300 hover:shadow-sm'
          : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
      }`}
    >
      <span className="shrink-0 text-xs font-bold text-gray-300 w-4 text-center mt-0.5">{rank}</span>

      <div className="min-w-0 flex-1">
        {/* Row 1: name + price + book */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate">{course?.name}</p>
            <p className="text-xs text-gray-400">{course?.city}</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <p className="text-base font-bold text-green-700 leading-none">${teeTime.price_per_player}</p>
            <a
              href={teeTime.booking_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`text-[11px] font-semibold text-white px-3 py-1 rounded-lg transition-colors whitespace-nowrap ${
                bookingTone === 'strong' ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-800 hover:bg-gray-900'
              }`}
            >
              {bookingLabel}
            </a>
          </div>
        </div>

        {/* Row 2: time + date + badges */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-xs font-semibold text-gray-700">{formatTime(teeTime.tee_time)}</span>
          <span className="text-[11px] text-gray-400">{formatDate(teeTime.tee_date)}</span>
          <span className="text-[11px] rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">
            {teeTime.holes}h
          </span>
          <span className={`text-[11px] rounded-full px-2 py-0.5 ${teeTime.walking_allowed ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
            {teeTime.walking_allowed ? 'Walk ✓' : 'Cart'}
          </span>
          <span className={`text-[11px] rounded-full px-2 py-0.5 ${
            bookingTone === 'strong' ? 'bg-green-50 text-green-700' : bookingTone === 'manual' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {bookingBadge}
          </span>
          <span className={`text-[11px] rounded-full px-2 py-0.5 font-semibold ${
            teeTime.available_spots <= 2
              ? 'bg-red-50 text-red-600'
              : 'bg-sky-50 text-sky-700'
          }`}>
            {teeTime.available_spots === 1 ? '1 spot left' : `${teeTime.available_spots} spots`}
          </span>
          <span className="text-[11px] rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
            Verified {timeAgo(teeTime.scraped_at)}
          </span>
        </div>
      </div>
    </div>
  )
}
