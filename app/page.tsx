'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { Course, TeeTime, TeeTimeQuery } from '@/types'
import { timeAgo } from '@/lib/utils'
import { ChatPanel } from '@/components/ChatPanel'
import { ResultsPanel } from '@/components/ResultsPanel'

const MapView = dynamic(() => import('@/components/Map').then((m) => m.Map), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-100 rounded-xl">
      <p className="text-gray-400 text-sm">Loading map…</p>
    </div>
  ),
})

const SUGGESTIONS = [
  'Morning tee time this Saturday near me',
  'Best value round this weekend',
  'Any walking slots tomorrow before 9am',
]

export default function Home() {
  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [resultsView, setResultsView] = useState<'list' | 'map'>('list')
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())
  const [recommendedIds, setRecommendedIds] = useState<string[]>([])
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<'chat' | 'results'>('chat')

  // Landing → split transition
  const [hasStarted, setHasStarted] = useState(false)
  const [initialMessage, setInitialMessage] = useState<string | null>(null)
  const [landingInput, setLandingInput] = useState('')
  const landingInputRef = useRef<HTMLTextAreaElement>(null)

  // Request geolocation from the landing page too
  useEffect(() => {
    if (!userLocation && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      )
    }
  }, [userLocation])

  const handleLandingSubmit = useCallback((text: string) => {
    if (!text.trim()) return
    setInitialMessage(text)
    setHasStarted(true)
  }, [])

  const handleTeeTimes = useCallback((tts: TeeTime[]) => {
    setTeeTimes(tts)
    setRecommendedIds([])
    if (tts.length > 0) {
      setLastUpdated(tts[0].scraped_at)
      setMobileTab('results')
    }
    const ttCourses = tts.map((tt) => tt.course).filter((c): c is Course => !!c)
    if (ttCourses.length > 0) {
      setCourses((prev) => {
        const ids = new Set(prev.map((c) => c.id))
        return [...prev, ...ttCourses.filter((c) => !ids.has(c.id))]
      })
    }
  }, [])

  const handleCourses = useCallback((c: Course[]) => setCourses(c), [])

  const handleSearchContext = useCallback((ctx: TeeTimeQuery) => {
    const newFilters = new Set<string>()
    if (ctx.max_price && ctx.max_price <= 40) newFilters.add('under40')
    else if (ctx.max_price && ctx.max_price <= 55) newFilters.add('under55')
    setActiveFilters(newFilters)
  }, [])

  const handleRecommendations = useCallback((ids: string[]) => {
    setRecommendedIds(ids)
  }, [])

  const hasResults = teeTimes.length > 0

  // ── Landing page ──
  if (!hasStarted) {
    return (
      <div className="flex flex-col h-screen bg-white items-center justify-center px-4">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2 mb-10">
          <div className="text-5xl">⛳</div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">TeeTime AI</h1>
          <p className="text-gray-400 text-sm">Find your perfect Boston tee time</p>
        </div>

        {/* Input */}
        <div className="w-full max-w-xl">
          <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 focus-within:border-green-400 focus-within:bg-white shadow-sm transition-all">
            <textarea
              ref={landingInputRef}
              value={landingInput}
              onChange={(e) => setLandingInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleLandingSubmit(landingInput)
                }
              }}
              placeholder="When do you want to play?"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none max-h-28"
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 112)}px`
              }}
              autoFocus
            />
            <button
              onClick={() => handleLandingSubmit(landingInput)}
              disabled={!landingInput.trim()}
              className="shrink-0 rounded-xl bg-green-600 p-2 text-white hover:bg-green-700 disabled:opacity-30 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>

          {/* Suggestions */}
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleLandingSubmit(s)}
                className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:border-green-300 hover:bg-green-50 hover:text-green-800 transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Verified badge */}
        <div className="mt-10 flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          <span className="text-xs font-medium text-green-700">18 Boston public courses · Verified live prices</span>
        </div>
      </div>
    )
  }

  // ── Split layout ──
  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Left: chat strip */}
        <div className={`flex-col bg-white border-r border-gray-100 z-10 md:flex md:w-[340px] md:flex-none md:shrink-0 ${mobileTab === 'chat' ? 'flex flex-1' : 'hidden'}`}>
          {/* Logo header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <span>⛳</span>
              <div>
                <p className="text-sm font-bold text-gray-900 leading-none">TeeTime AI</p>
                <p className="text-[10px] text-gray-400 leading-tight mt-0.5">
                  {lastUpdated ? `Updated ${timeAgo(lastUpdated)}` : '18 Boston public courses'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              <span className="text-[10px] font-medium text-green-700">Verified</span>
            </div>
          </div>

          <ChatPanel
            onTeeTimes={handleTeeTimes}
            onCourses={handleCourses}
            onSearchContext={handleSearchContext}
            onRecommendations={handleRecommendations}
            userLocation={userLocation}
            activeFilters={activeFilters}
            initialMessage={initialMessage}
          />
        </div>

        {/* Right: results panel */}
        <div className={`flex-1 flex-col overflow-hidden ${mobileTab === 'results' ? 'flex' : 'hidden md:flex'}`}>
          {hasResults ? (
            <ResultsPanel
              teeTimes={teeTimes}
              courses={courses}
              selectedCourseId={selectedCourseId}
              onCourseSelect={setSelectedCourseId}
              userLocation={userLocation}
              view={resultsView}
              onViewChange={setResultsView}
              MapComponent={MapView}
              activeFilters={activeFilters}
              onFiltersChange={setActiveFilters}
              recommendedIds={recommendedIds}
            />
          ) : (
            <EmptyResults />
          )}
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden flex shrink-0 bg-white border-t border-gray-100"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          onClick={() => setMobileTab('chat')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${mobileTab === 'chat' ? 'text-green-700' : 'text-gray-400'}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Chat
        </button>
        <button
          onClick={() => setMobileTab('results')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${mobileTab === 'results' ? 'text-green-700' : 'text-gray-400'}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          Results{teeTimes.length > 0 ? ` (${teeTimes.length})` : ''}
        </button>
      </nav>
    </div>
  )
}

function EmptyResults() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-8">
      <div className="text-5xl opacity-20">⛳</div>
      <p className="text-sm font-medium text-gray-400">Results will appear here</p>
      <p className="text-xs text-gray-300 max-w-xs">
        Tell the concierge when you want to play and where you are — tee times will show up instantly.
      </p>
    </div>
  )
}
