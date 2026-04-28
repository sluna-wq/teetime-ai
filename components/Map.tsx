'use client'

import { useEffect, useRef, useState } from 'react'
import type { Course, TeeTime } from '@/types'
import { formatTime, formatDate } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapboxMap = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapboxMarker = any

interface Props {
  courses: Course[]
  teeTimes: TeeTime[]
  selectedCourseId: string | null
  onCourseSelect: (courseId: string | null) => void
  userLocation: { lat: number; lng: number } | null
}

export function Map({ courses, teeTimes, selectedCourseId, onCourseSelect, userLocation }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<MapboxMap | null>(null)
  const markersRef = useRef<Record<string, MapboxMarker>>({})
  const [mapboxLoaded, setMapboxLoaded] = useState(false)

  const courseTimeCounts = teeTimes.reduce<Record<string, number>>((acc, tt) => {
    acc[tt.course_id] = (acc[tt.course_id] || 0) + 1
    return acc
  }, {})

  // Group tee times by course
  const timesByCourse = teeTimes.reduce<Record<string, TeeTime[]>>((acc, tt) => {
    if (!acc[tt.course_id]) acc[tt.course_id] = []
    acc[tt.course_id].push(tt)
    return acc
  }, {})

  useEffect(() => {
    if (typeof window === 'undefined') return
    import('mapbox-gl').then((mapboxgl) => {
      const mapboxGl = mapboxgl.default
      mapboxGl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
      if (!mapRef.current || mapInstanceRef.current) return

      const map = new mapboxGl.Map({
        container: mapRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [-71.0589, 42.3601],
        zoom: 9.5,
        attributionControl: false,
      })
      map.addControl(new mapboxGl.NavigationControl({ showCompass: false }), 'top-right')
      mapInstanceRef.current = map
      setMapboxLoaded(true)
    })
    return () => {
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapboxLoaded || !mapInstanceRef.current) return

    import('mapbox-gl').then((mapboxgl) => {
      const mapboxGl = mapboxgl.default
      const map = mapInstanceRef.current!

      Object.values(markersRef.current).forEach((m) => m.remove())
      markersRef.current = {}

      courses.forEach((course) => {
        const count = courseTimeCounts[course.id] || 0
        const isSelected = selectedCourseId === course.id
        const hasSlots = count > 0
        const courseTimes = (timesByCourse[course.id] || []).slice(0, 4)

        const el = document.createElement('div')
        el.style.cssText = `
          width: ${isSelected ? '46px' : '38px'};
          height: ${isSelected ? '46px' : '38px'};
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          color: white;
          transition: all 0.15s ease;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          border: ${isSelected ? '3px solid white' : '2px solid white'};
          background: ${isSelected ? '#15803d' : hasSlots ? '#16a34a' : '#9ca3af'};
          font-family: system-ui, sans-serif;
        `
        el.textContent = hasSlots ? String(count) : '·'
        el.title = course.name

        // Build popup HTML with tee times
        const timesHtml = courseTimes.length > 0
          ? courseTimes.map((tt) => `
              <a href="${tt.booking_url}" target="_blank" rel="noopener noreferrer"
                style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;text-decoration:none;color:inherit;gap:12px">
                <span style="font-size:13px;font-weight:600;color:#111">${formatTime(tt.tee_time)}</span>
                <span style="font-size:12px;color:#6b7280">${tt.holes}h · ${tt.walking_allowed ? 'Walk' : 'Cart'}</span>
                <span style="font-size:13px;font-weight:700;color:#16a34a">$${tt.price_per_player}</span>
                <span style="font-size:11px;background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:999px;font-weight:600">Book →</span>
              </a>`).join('')
          : '<p style="color:#9ca3af;font-size:13px;margin:8px 0">No slots in current search</p>'

        const moreCount = (timesByCourse[course.id] || []).length - 4
        const moreHtml = moreCount > 0
          ? `<p style="font-size:12px;color:#9ca3af;margin:6px 0 0;text-align:center">+${moreCount} more — ask the AI to filter</p>`
          : ''

        const popupHtml = `
          <div style="font-family:system-ui,sans-serif;min-width:220px;max-width:280px">
            <div style="padding:0 0 8px">
              <p style="font-weight:700;font-size:14px;margin:0 0 2px;color:#111">${course.name}</p>
              <p style="color:#6b7280;font-size:12px;margin:0">${course.city} · ${course.price_range} · ${course.holes_available?.join(' or ')} holes</p>
            </div>
            <div style="border-top:1px solid #f3f4f6;padding-top:8px">
              ${hasSlots ? `<p style="font-size:11px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:.05em;margin:0 0 4px">${count} available slot${count > 1 ? 's' : ''}</p>${timesHtml}${moreHtml}` : '<p style="color:#9ca3af;font-size:13px;margin:0">No slots in current search — ask the AI for different dates</p>'}
            </div>
          </div>`

        const popup = new mapboxGl.Popup({
          offset: 16,
          closeButton: true,
          maxWidth: '300px',
        }).setHTML(popupHtml)

        // Create marker first so click handler can reference it directly
        const marker = new mapboxGl.Marker({ element: el })
          .setLngLat([course.lng, course.lat])
          .setPopup(popup)
          .addTo(map)

        markersRef.current[course.id] = marker

        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onCourseSelect(isSelected ? null : course.id)
          marker.togglePopup()
        })
      })

      // User dot
      if (userLocation) {
        const el = document.createElement('div')
        el.style.cssText = `width:14px;height:14px;background:#3b82f6;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px rgba(59,130,246,0.25);`
        new mapboxGl.Marker({ element: el })
          .setLngLat([userLocation.lng, userLocation.lat])
          .addTo(map)
      }
    })
  }, [mapboxLoaded, courses, teeTimes, selectedCourseId, userLocation, courseTimeCounts, timesByCourse, onCourseSelect])

  // Fly to selected course
  useEffect(() => {
    if (!selectedCourseId || !mapInstanceRef.current) return
    const course = courses.find((c) => c.id === selectedCourseId)
    if (!course) return
    mapInstanceRef.current.flyTo({ center: [course.lng, course.lat], zoom: 13, duration: 700 })
  }, [selectedCourseId, courses])

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full rounded-xl overflow-hidden" />
      {!mapboxLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-xl">
          <p className="text-gray-400 text-sm">Loading map…</p>
        </div>
      )}
      {/* Legend */}
      {courses.length > 0 && (
        <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-md px-3 py-2 flex items-center gap-3 text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-green-500 inline-block" />
            Has slots
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-gray-400 inline-block" />
            No slots
          </span>
          <span className="text-gray-400">· Click any marker</span>
        </div>
      )}
    </div>
  )
}
