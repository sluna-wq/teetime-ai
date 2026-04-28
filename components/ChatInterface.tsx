'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { TeeTime, Course, ChatMessage } from '@/types'
import { TeeTimeCard } from './TeeTimeCard'
import { cn } from '@/lib/utils'

interface Props {
  onTeeTimes: (teeTimes: TeeTime[]) => void
  onCourses: (courses: Course[]) => void
  selectedCourseId: string | null
  onCourseSelect: (id: string | null) => void
  userLocation: { lat: number; lng: number } | null
  onSetUserLocation: (loc: { lat: number; lng: number } | null) => void
}

const SUGGESTIONS = [
  'Find me tee times this weekend near Cambridge',
  "What's available tomorrow morning under $50?",
  'Show 18-hole courses closest to me',
  'Alert me when Fresh Pond has a Saturday morning slot',
]

export function ChatInterface({
  onTeeTimes,
  onCourses,
  selectedCourseId,
  userLocation,
  onSetUserLocation,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [latestTeeTimes, setLatestTeeTimes] = useState<TeeTime[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, latestTeeTimes])

  // Get user location on mount
  useEffect(() => {
    if (!userLocation && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => onSetUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {/* silently fail */}
      )
    }
  }, [userLocation, onSetUserLocation])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMessage: ChatMessage = { role: 'user', content: text }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)
    setLatestTeeTimes([])

    // Build API messages — inject user location context into first message
    let firstUserContent = text
    if (userLocation && messages.length === 0) {
      firstUserContent = `[User is at coordinates: ${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}]\n\n${text}`
    }

    const apiMessages = newMessages.map((m, i) => ({
      role: m.role,
      content: i === 0 ? firstUserContent : m.content,
    }))

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''
      let currentTeeTimes: TeeTime[] = []

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter((l) => l.startsWith('data: '))

        for (const line of lines) {
          const data = line.slice(6)
          if (data === '[DONE]') break

          try {
            const event = JSON.parse(data)

            if (event.type === 'text') {
              assistantText += event.text
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: assistantText }
                return updated
              })
            }

            if (event.type === 'tool_result' && event.name === 'search_tee_times') {
              const result = event.result as { tee_times?: TeeTime[] }
              if (result.tee_times) {
                currentTeeTimes = result.tee_times
                setLatestTeeTimes(result.tee_times)
                onTeeTimes(result.tee_times)
              }
            }

            if (event.type === 'tool_result' && event.name === 'get_courses') {
              const result = event.result as { courses?: Course[] }
              if (result.courses) {
                onCourses(result.courses)
              }
            }
          } catch { /* skip malformed chunks */ }
        }
      }

      // Store tee times on the final message
      if (currentTeeTimes.length > 0) {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            tee_times: currentTeeTimes,
          }
          return updated
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setMessages((prev) => [...prev, { role: 'assistant', content: `Sorry, I hit an error: ${msg}` }])
    } finally {
      setIsLoading(false)
      setLatestTeeTimes([])
      inputRef.current?.focus()
    }
  }, [messages, isLoading, userLocation, onTeeTimes, onCourses])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 pb-8">
            <div className="text-center">
              <div className="text-4xl mb-3">⛳</div>
              <h2 className="text-xl font-semibold text-gray-900">Find your tee time</h2>
              <p className="text-gray-500 text-sm mt-1 max-w-xs">
                Ask me anything about golf in Boston — availability, prices, courses, or set an alert for when your ideal slot opens up.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-left text-sm text-gray-700 hover:border-green-300 hover:bg-green-50 hover:text-green-800 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, i) => (
          <div key={i} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
                message.role === 'user'
                  ? 'bg-green-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-900 rounded-bl-sm'
              )}
            >
              {message.content && (
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              )}

              {/* Inline tee time cards for this message */}
              {message.tee_times && message.tee_times.length > 0 && (
                <div className="mt-3 space-y-2">
                  {message.tee_times.slice(0, 5).map((tt) => (
                    <TeeTimeCard key={tt.id} teeTime={tt} />
                  ))}
                  {message.tee_times.length > 5 && (
                    <p className="text-xs text-gray-500 text-center pt-1">
                      +{message.tee_times.length - 5} more shown on map
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming tee time cards (while response is loading) */}
        {isLoading && latestTeeTimes.length > 0 && (
          <div className="space-y-2 px-1">
            {latestTeeTimes.slice(0, 3).map((tt) => (
              <TeeTimeCard key={tt.id} teeTime={tt} />
            ))}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 bg-white p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-green-400 focus-within:bg-white transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about tee times, set an alert…"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none max-h-32"
            style={{ height: 'auto', minHeight: '20px' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${el.scrollHeight}px`
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="shrink-0 rounded-xl bg-green-600 p-2 text-white transition-colors hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <SendIcon />
          </button>
        </div>
        <p className="mt-1.5 text-center text-xs text-gray-400">
          18 Boston public courses · Updates every 30 min
        </p>
      </div>
    </div>
  )
}

function SendIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}
