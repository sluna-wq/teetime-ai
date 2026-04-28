'use client'

import { useEffect, useRef, useState } from 'react'
import type { Course, TeeTime } from '@/types'
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

  // Course -> tee time count lookup
  const courseTimeCounts = teeTimes.reduce<Record<string, number>>((acc, tt) => {
    acc[tt.course_id] = (acc[tt.course_id] || 0) + 1
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

  // Add/update markers when courses or tee times change
  useEffect(() => {
    if (!mapboxLoaded || !mapInstanceRef.current) return

    import('mapbox-gl').then((mapboxgl) => {
      const mapboxGl = mapboxgl.default
      const map = mapInstanceRef.current!

      // Remove old markers
      Object.values(markersRef.current).forEach((m) => m.remove())
      markersRef.current = {}

      // Add course markers
      courses.forEach((course) => {
        const count = courseTimeCounts[course.id] || 0
        const isSelected = selectedCourseId === course.id
        const hasSlots = count > 0

        const el = document.createElement('div')
        el.className = 'course-marker'
        el.style.cssText = `
          width: ${isSelected ? '48px' : '40px'};
          height: ${isSelected ? '48px' : '40px'};
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          color: white;
          transition: all 0.15s;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
          border: ${isSelected ? '3px solid white' : '2px solid white'};
          background: ${isSelected ? '#15803d' : hasSlots ? '#16a34a' : '#9ca3af'};
          font-family: system-ui, sans-serif;
        `
        el.textContent = hasSlots ? String(count) : '—'
        el.title = course.name

        el.addEventListener('click', () => {
          onCourseSelect(isSelected ? null : course.id)
        })

        const marker = new mapboxGl.Marker({ element: el })
          .setLngLat([course.lng, course.lat])
          .setPopup(
            new mapboxGl.Popup({ offset: 25, closeButton: false }).setHTML(`
              <div style="font-family:system-ui,sans-serif;padding:4px 2px">
                <p style="font-weight:600;margin:0 0 2px">${course.name}</p>
                <p style="color:#666;margin:0;font-size:12px">${course.city} · ${course.price_range}</p>
                ${hasSlots ? `<p style="color:#16a34a;margin:4px 0 0;font-size:12px;font-weight:600">${count} slots available</p>` : '<p style="color:#9ca3af;margin:4px 0 0;font-size:12px">No slots today</p>'}
              </div>
            `)
          )
          .addTo(map)

        markersRef.current[course.id] = marker
      })

      // User location marker
      if (userLocation) {
        const el = document.createElement('div')
        el.style.cssText = `
          width: 16px; height: 16px;
          background: #3b82f6;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.3);
        `
        new mapboxGl.Marker({ element: el })
          .setLngLat([userLocation.lng, userLocation.lat])
          .addTo(map)
      }
    })
  }, [mapboxLoaded, courses, teeTimes, selectedCourseId, userLocation, courseTimeCounts, onCourseSelect])

  // Fly to selected course
  useEffect(() => {
    if (!selectedCourseId || !mapInstanceRef.current) return
    const course = courses.find((c) => c.id === selectedCourseId)
    if (!course) return
    mapInstanceRef.current.flyTo({
      center: [course.lng, course.lat],
      zoom: 12,
      duration: 800,
    })
  }, [selectedCourseId, courses])

  return (
    <div ref={mapRef} className="h-full w-full rounded-xl overflow-hidden">
      {!mapboxLoaded && (
        <div className="flex h-full items-center justify-center bg-gray-100 rounded-xl">
          <p className="text-gray-400 text-sm">Loading map…</p>
        </div>
      )}
    </div>
  )
}
