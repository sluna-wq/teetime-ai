'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { Course, TeeTime } from '@/types'
import { ChatInterface } from '@/components/ChatInterface'

// Map must be client-only (uses Mapbox GL which requires window)
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
  const [mobileTab, setMobileTab] = useState<'chat' | 'map'>('chat')

  const handleTeeTimes = useCallback((tts: TeeTime[]) => {
    setTeeTimes(tts)
    const ttCourses = tts
      .map((tt) => tt.course)
      .filter((c): c is Course => !!c)
    if (ttCourses.length > 0) {
      setCourses((prev) => {
        const existingIds = new Set(prev.map((c) => c.id))
        const newCourses = ttCourses.filter((c) => !existingIds.has(c.id))
        return [...prev, ...newCourses]
      })
    }
  }, [])

  const handleCourses = useCallback((c: Course[]) => {
    setCourses(c)
  }, [])

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">⛳</span>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">TeeTime AI</h1>
            <p className="text-xs text-gray-400 leading-tight">Boston public golf · 18 courses</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            <span className="text-xs font-medium text-green-700">Live · 30 min refresh</span>
          </div>
        </div>
      </header>

      {/* Mobile tab switcher */}
      <div className="flex border-b border-gray-100 bg-white md:hidden shrink-0">
        <button
          onClick={() => setMobileTab('chat')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mobileTab === 'chat' ? 'border-b-2 border-green-600 text-green-700' : 'text-gray-500'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setMobileTab('map')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mobileTab === 'map' ? 'border-b-2 border-green-600 text-green-700' : 'text-gray-500'
          }`}
        >
          Map{teeTimes.length > 0 && (
            <span className="ml-1 rounded-full bg-green-100 px-1.5 text-xs text-green-700">
              {teeTimes.length}
            </span>
          )}
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat panel */}
        <div
          className={`flex flex-col overflow-hidden md:flex md:w-[420px] md:shrink-0 md:border-r md:border-gray-100 md:bg-white ${
            mobileTab === 'chat' ? 'flex w-full bg-white' : 'hidden'
          }`}
        >
          <ChatInterface
            onTeeTimes={handleTeeTimes}
            onCourses={handleCourses}
            selectedCourseId={selectedCourseId}
            onCourseSelect={setSelectedCourseId}
            userLocation={userLocation}
            onSetUserLocation={setUserLocation}
          />
        </div>

        {/* Map panel */}
        <div
          className={`flex-1 p-3 md:flex ${mobileTab === 'map' ? 'flex w-full' : 'hidden'}`}
        >
          <Map
            courses={courses}
            teeTimes={teeTimes}
            selectedCourseId={selectedCourseId}
            onCourseSelect={setSelectedCourseId}
            userLocation={userLocation}
          />
        </div>
      </div>
    </div>
  )
}
