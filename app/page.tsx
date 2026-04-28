'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { Course, TeeTime } from '@/types'
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

export default function Home() {
  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [resultsView, setResultsView] = useState<'list' | 'map'>('list')

  const handleTeeTimes = useCallback((tts: TeeTime[]) => {
    setTeeTimes(tts)
    const ttCourses = tts.map((tt) => tt.course).filter((c): c is Course => !!c)
    if (ttCourses.length > 0) {
      setCourses((prev) => {
        const ids = new Set(prev.map((c) => c.id))
        return [...prev, ...ttCourses.filter((c) => !ids.has(c.id))]
      })
    }
  }, [])

  const handleCourses = useCallback((c: Course[]) => setCourses(c), [])

  const hasResults = teeTimes.length > 0

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ── Left: narrow chat strip ── */}
      <div className="flex flex-col w-[340px] shrink-0 bg-white border-r border-gray-100 z-10">
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <span>⛳</span>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-none">TeeTime AI</p>
              <p className="text-[10px] text-gray-400 leading-tight mt-0.5">18 Boston public courses</p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            <span className="text-[10px] font-medium text-green-700">Live</span>
          </div>
        </div>

        {/* Chat */}
        <ChatPanel
          onTeeTimes={handleTeeTimes}
          onCourses={handleCourses}
          userLocation={userLocation}
          onSetUserLocation={setUserLocation}
        />
      </div>

      {/* ── Right: results panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
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
          />
        ) : (
          <EmptyResults />
        )}
      </div>
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
