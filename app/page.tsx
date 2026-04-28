'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { Course, TeeTime } from '@/types'
import { ChatInterface } from '@/components/ChatInterface'

const Map = dynamic(() => import('@/components/Map').then((m) => m.Map), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-100 rounded-xl">
      <p className="text-gray-400 text-sm">Loading map…</p>
    </div>
  ),
})

export default function Home() {
  const [courses, setCourses] = useState<Course[]>([])
  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [mapOpen, setMapOpen] = useState(false)

  const handleTeeTimes = useCallback((tts: TeeTime[]) => {
    setTeeTimes(tts)
    const ttCourses = tts.map((tt) => tt.course).filter((c): c is Course => !!c)
    if (ttCourses.length > 0) {
      setCourses((prev) => {
        const existingIds = new Set(prev.map((c) => c.id))
        const newCourses = ttCourses.filter((c) => !existingIds.has(c.id))
        return [...prev, ...newCourses]
      })
    }
  }, [])

  const handleCourses = useCallback((c: Course[]) => setCourses(c), [])

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">⛳</span>
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">TeeTime AI</h1>
            <p className="text-[11px] text-gray-400 leading-tight">18 Boston public courses</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            <span className="text-[11px] font-medium text-green-700">Live</span>
          </div>
          <button
            onClick={() => setMapOpen((o) => !o)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
              mapOpen
                ? 'border-green-400 bg-green-50 text-green-700'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
              <line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
            </svg>
            Map{teeTimes.length > 0 && <span className="ml-0.5 text-green-600 font-semibold">{teeTimes.length}</span>}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat — always full width, shrinks when map opens */}
        <div className={`flex flex-col overflow-hidden bg-white transition-all duration-300 ${mapOpen ? 'w-[420px] shrink-0 border-r border-gray-100' : 'w-full'}`}>
          <ChatInterface
            onTeeTimes={handleTeeTimes}
            onCourses={handleCourses}
            selectedCourseId={selectedCourseId}
            onCourseSelect={setSelectedCourseId}
            userLocation={userLocation}
            onSetUserLocation={setUserLocation}
          />
        </div>

        {/* Map — slides in when toggled */}
        {mapOpen && (
          <div className="flex-1 p-3">
            <Map
              courses={courses}
              teeTimes={teeTimes}
              selectedCourseId={selectedCourseId}
              onCourseSelect={setSelectedCourseId}
              userLocation={userLocation}
            />
          </div>
        )}
      </div>
    </div>
  )
}
