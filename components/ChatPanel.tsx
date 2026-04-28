'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TeeTime, Course, ChatMessage } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  onTeeTimes: (tts: TeeTime[]) => void
  onCourses: (courses: Course[]) => void
  userLocation: { lat: number; lng: number } | null
  onSetUserLocation: (loc: { lat: number; lng: number } | null) => void
}

type LoadStatus = 'idle' | 'thinking' | 'searching' | 'streaming'

// Quick filter chips — prepopulate the search query
interface QuickFilter {
  key: string
  label: string
  value: string  // appended to message
  active: boolean
}

const INITIAL_FILTERS: Omit<QuickFilter, 'active'>[] = [
  { key: 'holes18', label: '18 holes', value: '18 holes' },
  { key: 'holes9',  label: '9 holes',  value: '9 holes'  },
  { key: 'walk',    label: 'Walking',  value: 'walking preferred' },
  { key: 'solo',    label: 'Solo',     value: 'just me (1 player)' },
  { key: 'duo',     label: '2 players',value: '2 players' },
  { key: 'four',    label: 'Foursome', value: 'foursome (4 players)' },
]

const SUGGESTIONS = [
  'Morning tee time this Saturday near me',
  'Best value round this weekend',
  'Any walking slots tomorrow before 9am',
]

function injectLocation(content: string, loc: { lat: number; lng: number } | null) {
  if (!loc) return content
  return `[User GPS: ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}]\n${content}`
}

export function ChatPanel({ onTeeTimes, onCourses, userLocation, onSetUserLocation }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isLoading = status !== 'idle'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  useEffect(() => {
    if (!userLocation && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => onSetUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      )
    }
  }, [userLocation, onSetUserLocation])

  const toggleFilter = (key: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        // mutually exclusive groups
        if (key === 'holes18' || key === 'holes9') { next.delete('holes18'); next.delete('holes9') }
        if (key === 'solo' || key === 'duo' || key === 'four') { next.delete('solo'); next.delete('duo'); next.delete('four') }
        if (key === 'walk') { /* can combine with others */ }
        next.add(key)
      }
      return next
    })
  }

  const buildMessage = useCallback((text: string) => {
    const filters = INITIAL_FILTERS.filter((f) => activeFilters.has(f.key)).map((f) => f.value)
    if (filters.length === 0) return text
    return `${text} (${filters.join(', ')})`
  }, [activeFilters])

  const sendMessage = useCallback(async (rawText: string) => {
    if (!rawText.trim() || isLoading) return
    const text = buildMessage(rawText)

    const userMessage: ChatMessage = { role: 'user', content: rawText } // show raw in UI
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setStatus('thinking')

    // API gets the enriched message with filters + GPS
    const apiMessages = newMessages.map((m, i) => ({
      role: m.role,
      content: m.role === 'user'
        ? injectLocation(i === newMessages.length - 1 ? text : m.content, userLocation)
        : m.content,
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
      let rowAdded = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value).split('\n').filter((l) => l.startsWith('data: '))
        for (const line of lines) {
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const event = JSON.parse(data)
            if (event.type === 'tool_call' && event.name === 'search_tee_times') setStatus('searching')
            if (event.type === 'text') {
              if (!rowAdded) {
                setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
                rowAdded = true
              }
              setStatus('streaming')
              assistantText += event.text
              setMessages((prev) => {
                const u = [...prev]
                u[u.length - 1] = { role: 'assistant', content: assistantText }
                return u
              })
            }
            if (event.type === 'tool_result' && event.name === 'search_tee_times') {
              const r = event.result as { tee_times?: TeeTime[] }
              if (r.tee_times) { currentTeeTimes = r.tee_times; onTeeTimes(r.tee_times) }
            }
            if (event.type === 'tool_result' && event.name === 'get_courses') {
              const r = event.result as { courses?: Course[] }
              if (r.courses) onCourses(r.courses)
            }
          } catch { /* skip */ }
        }
      }

      // If we got tee times but no text row yet (tool only, no text), still show results
      if (currentTeeTimes.length > 0 && !rowAdded) {
        onTeeTimes(currentTeeTimes)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setMessages((prev) => [...prev, { role: 'assistant', content: `Sorry — ${msg}` }])
    } finally {
      setStatus('idle')
      inputRef.current?.focus()
    }
  }, [messages, isLoading, status, userLocation, onTeeTimes, onCourses, buildMessage])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-300 px-1">Try asking</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => sendMessage(s)}
                className="rounded-xl border border-gray-100 px-3 py-2 text-left text-xs text-gray-500 hover:border-green-200 hover:bg-green-50 hover:text-green-800 transition-all leading-relaxed">
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => {
          const isUser = m.role === 'user'
          return (
            <div key={i} className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
              {!isUser && (
                <div className="shrink-0 mt-0.5 h-5 w-5 rounded-full bg-green-600 flex items-center justify-center text-[9px]">⛳</div>
              )}
              <div className={cn(
                'max-w-[88%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                isUser ? 'bg-green-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-900 rounded-tl-sm'
              )}>
                {isUser ? (
                  <p>{m.content}</p>
                ) : (
                  <div className="prose prose-xs max-w-none prose-p:my-0.5 prose-strong:font-semibold prose-strong:text-gray-900">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => <p className="font-semibold">{children}</p>,
                        h2: ({ children }) => <p className="font-semibold">{children}</p>,
                        h3: ({ children }) => <p className="font-semibold">{children}</p>,
                        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-green-700 underline">{children}</a>,
                        ul: ({ children }) => <ul className="my-1 pl-3 list-disc">{children}</ul>,
                        li: ({ children }) => <li className="my-0">{children}</li>,
                        p: ({ children }) => <p className="my-0.5">{children}</p>,
                      }}
                    >{m.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {(status === 'thinking' || status === 'searching') && (
          <div className="flex gap-2">
            <div className="shrink-0 h-5 w-5 rounded-full bg-green-600 flex items-center justify-center text-[9px]">⛳</div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 flex items-center gap-2">
              <div className="flex gap-0.5">
                {[0, 150, 300].map((d) => (
                  <div key={d} className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
              <span className="text-[11px] text-gray-400">{status === 'searching' ? 'Checking tee times…' : 'Thinking…'}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick filter chips */}
      <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5 border-t border-gray-50">
        {INITIAL_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => toggleFilter(f.key)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all',
              activeFilters.has(f.key)
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-1.5">
        <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-green-400 focus-within:bg-white transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="When do you want to play?"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent text-xs text-gray-900 placeholder-gray-400 outline-none max-h-20"
            onInput={(e) => {
              const el = e.currentTarget; el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 80)}px`
            }}
          />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading}
            className="shrink-0 rounded-lg bg-green-600 p-1.5 text-white hover:bg-green-700 disabled:opacity-40 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
