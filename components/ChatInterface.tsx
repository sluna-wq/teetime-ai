'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TeeTime, Course, ChatMessage } from '@/types'
import { TeeTimeResults } from './TeeTimeResults'
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
  'Morning tee time tomorrow, walking preferred',
  'Best value round this weekend',
  'Foursome Saturday near Cambridge',
  'Alert me when Fresh Pond opens up Sunday',
]

// Parse CHIPS: line from assistant response
function parseChips(content: string): { text: string; chips: string[] } {
  const chipsMatch = content.match(/\nCHIPS:\s*(.+)$/m)
  if (!chipsMatch) return { text: content, chips: [] }
  const chips = chipsMatch[1].split('|').map((c) => c.trim()).filter(Boolean)
  const text = content.replace(/\nCHIPS:\s*.+$/m, '').trimEnd()
  return { text, chips }
}

// Always prepend location context to every user message sent to the API
function injectLocation(content: string, loc: { lat: number; lng: number } | null): string {
  if (!loc) return content
  return `[User GPS: ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}]\n${content}`
}

export function ChatInterface({
  onTeeTimes,
  onCourses,
  userLocation,
  onSetUserLocation,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Request GPS on mount
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

    // Inject GPS into every user message for the API
    const apiMessages = newMessages.map((m) => ({
      role: m.role,
      content: m.role === 'user' ? injectLocation(m.content, userLocation) : m.content,
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

      // Add empty assistant message to stream into
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

      // Attach tee times to the final message
      if (currentTeeTimes.length > 0) {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { ...updated[updated.length - 1], tee_times: currentTeeTimes }
          return updated
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setMessages((prev) => [...prev, { role: 'assistant', content: `Sorry — ${msg}` }])
    } finally {
      setIsLoading(false)
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

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col h-full justify-end pb-2 gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-300 mb-2.5">Try asking</p>
              <div className="grid grid-cols-1 gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="rounded-xl border border-gray-200 px-4 py-2.5 text-left text-sm text-gray-600 hover:border-green-300 hover:bg-green-50 hover:text-green-800 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Message thread */}
        {messages.map((message, i) => {
          const isUser = message.role === 'user'
          const isLast = i === messages.length - 1

          // Parse chips out of assistant text
          const { text: displayText, chips } = isUser
            ? { text: message.content, chips: [] }
            : parseChips(message.content)

          return (
            <div key={i} className={cn('flex gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
              {/* AI avatar */}
              {!isUser && (
                <div className="shrink-0 mt-0.5 h-6 w-6 rounded-full bg-green-600 flex items-center justify-center text-white text-[10px] font-bold">
                  ⛳
                </div>
              )}

              <div className={cn('flex flex-col gap-2', isUser ? 'items-end max-w-[82%]' : 'items-start w-full')}>
                {/* Bubble */}
                <div className={cn(
                  'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  isUser
                    ? 'bg-green-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-900 rounded-tl-sm'
                )}>
                  {isUser ? (
                    <p>{message.content}</p>
                  ) : (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-strong:font-semibold prose-strong:text-gray-900">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ children }) => <p className="font-semibold">{children}</p>,
                          h2: ({ children }) => <p className="font-semibold">{children}</p>,
                          h3: ({ children }) => <p className="font-semibold">{children}</p>,
                          a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="text-green-700 underline underline-offset-2">{children}</a>
                          ),
                          ul: ({ children }) => <ul className="my-1 pl-4 list-disc space-y-0.5">{children}</ul>,
                          li: ({ children }) => <li>{children}</li>,
                          p: ({ children }) => <p className="my-1">{children}</p>,
                        }}
                      >
                        {displayText}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

                {/* Tee time results — clean comparison strip, outside bubble */}
                {message.tee_times && message.tee_times.length > 0 && (
                  <TeeTimeResults
                    teeTimes={message.tee_times.slice(0, 3)}
                    totalCount={message.tee_times.length}
                  />
                )}

                {/* Quick-action chips — only on last assistant message */}
                {!isUser && chips.length > 0 && isLast && !isLoading && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {chips.map((chip) => (
                      <button
                        key={chip}
                        onClick={() => sendMessage(chip)}
                        className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:border-green-400 hover:bg-green-50 hover:text-green-800 transition-all"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex gap-2.5 justify-start">
            <div className="shrink-0 h-6 w-6 rounded-full bg-green-600 flex items-center justify-center text-[10px]">⛳</div>
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
        <p className="mt-1.5 text-center text-[11px] text-gray-400">18 Boston public courses · live data</p>
      </div>
    </div>
  )
}
