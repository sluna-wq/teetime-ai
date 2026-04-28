'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
  'Tee times this Saturday near Cambridge',
  'Best value 18-hole round this weekend',
  'Morning slot tomorrow, walking preferred',
  'Alert me when Fresh Pond has a Sunday opening',
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
  const [streamingTeeTimes, setStreamingTeeTimes] = useState<TeeTime[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingTeeTimes])

  useEffect(() => {
    if (!userLocation && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => onSetUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
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
    setStreamingTeeTimes([])

    let firstUserContent = text
    if (userLocation && messages.length === 0) {
      firstUserContent = `[User location: ${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}]\n\n${text}`
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
                setStreamingTeeTimes(result.tee_times.slice(0, 3))
                onTeeTimes(result.tee_times)
              }
            }

            if (event.type === 'tool_result' && event.name === 'get_courses') {
              const result = event.result as { courses?: Course[] }
              if (result.courses) onCourses(result.courses)
            }
          } catch { /* skip malformed */ }
        }
      }

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
      setMessages((prev) => [...prev, { role: 'assistant', content: `Sorry — ${msg}` }])
    } finally {
      setIsLoading(false)
      setStreamingTeeTimes([])
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
    <div className="flex h-full flex-col bg-white">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col h-full justify-end pb-4 gap-5">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Try asking</p>
              <div className="grid grid-cols-1 gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="rounded-xl border border-gray-200 px-4 py-2.5 text-left text-sm text-gray-700 hover:border-green-300 hover:bg-green-50 hover:text-green-800 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((message, i) => (
          <div key={i} className={cn('flex gap-3', message.role === 'user' ? 'justify-end' : 'justify-start')}>
            {message.role === 'assistant' && (
              <div className="shrink-0 mt-0.5 h-7 w-7 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">
                AI
              </div>
            )}
            <div className={cn('max-w-[88%]', message.role === 'user' ? 'items-end' : 'items-start', 'flex flex-col gap-2')}>
              <div
                className={cn(
                  'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  message.role === 'user'
                    ? 'bg-green-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-900 rounded-tl-sm'
                )}
              >
                {message.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none prose-p:my-1 prose-p:leading-relaxed prose-strong:text-gray-900 prose-strong:font-semibold">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // No headers — strip them to bold text
                        h1: ({ children }) => <p className="font-semibold">{children}</p>,
                        h2: ({ children }) => <p className="font-semibold">{children}</p>,
                        h3: ({ children }) => <p className="font-semibold">{children}</p>,
                        // Links open in new tab
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-green-700 underline underline-offset-2">
                            {children}
                          </a>
                        ),
                        // Tight lists
                        ul: ({ children }) => <ul className="my-1 space-y-0.5 pl-4 list-disc">{children}</ul>,
                        ol: ({ children }) => <ol className="my-1 space-y-0.5 pl-4 list-decimal">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        p: ({ children }) => <p className="my-1">{children}</p>,
                        hr: () => <div className="my-2 border-t border-gray-200" />,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p>{message.content}</p>
                )}
              </div>

              {/* Tee time cards — only show top 3 */}
              {message.tee_times && message.tee_times.length > 0 && (
                <div className="w-full space-y-2">
                  {message.tee_times.slice(0, 3).map((tt) => (
                    <TeeTimeCard key={tt.id} teeTime={tt} />
                  ))}
                  {message.tee_times.length > 3 && (
                    <p className="text-xs text-gray-400 text-center pt-1">
                      +{message.tee_times.length - 3} more available · click map markers to explore
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming tee times while loading */}
        {isLoading && streamingTeeTimes.length > 0 && (
          <div className="pl-10 space-y-2">
            {streamingTeeTimes.map((tt) => (
              <TeeTimeCard key={tt.id} teeTime={tt} />
            ))}
          </div>
        )}

        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="shrink-0 h-7 w-7 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">
              AI
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-4">
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
      <div className="border-t border-gray-100 p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-green-400 focus-within:bg-white transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="When do you want to play?"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none max-h-28"
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 112)}px`
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="shrink-0 rounded-xl bg-green-600 p-2 text-white transition-colors hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-gray-400">
          18 Boston public courses · live data
        </p>
      </div>
    </div>
  )
}
