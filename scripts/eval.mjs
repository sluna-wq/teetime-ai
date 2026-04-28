#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const tasksPath = path.join(repoRoot, 'evals', 'tasks.json')

const MODE = process.env.EVAL_MODE || getArg('--mode') || 'fixture'
const BASE_URL = process.env.EVAL_BASE_URL || getArg('--base-url') || 'http://localhost:3000'
const CHECK_LINKS = process.env.EVAL_CHECK_LINKS === '1' || process.argv.includes('--check-links')
const TRIALS = Number(process.env.EVAL_TRIALS || getArg('--trials') || (MODE === 'local' ? 3 : 1))
const TODAY = parseDate(process.env.EVAL_TODAY || new Date().toISOString().slice(0, 10))

const fixtureCourses = [
  {
    id: 'course-fresh-pond',
    name: 'Fresh Pond Golf Course',
    city: 'Cambridge',
    lat: 42.3823,
    lng: -71.1458,
    website: 'https://www.freshpondgolf.com',
    walking_allowed: true
  },
  {
    id: 'course-george-wright',
    name: 'George Wright Golf Course',
    city: 'Hyde Park',
    lat: 42.2378,
    lng: -71.1264,
    website: 'https://www.cityofbostongolf.com/george-wright',
    walking_allowed: true
  },
  {
    id: 'course-devine',
    name: 'William J. Devine Golf Course',
    city: 'Dorchester',
    lat: 42.3057,
    lng: -71.0923,
    website: 'https://www.cityofbostongolf.com/franklin-park',
    walking_allowed: true
  },
  {
    id: 'course-putterham',
    name: 'Putterham Meadows',
    city: 'Brookline',
    lat: 42.3051,
    lng: -71.1559,
    website: 'https://www.brooklinegolf.com',
    walking_allowed: true
  },
  {
    id: 'course-granite-links',
    name: 'Granite Links',
    city: 'Quincy',
    lat: 42.2497,
    lng: -71.0504,
    website: 'https://www.granitelinks.com/golf/tee-times',
    walking_allowed: false
  },
  {
    id: 'course-presidents',
    name: "President's Golf Course",
    city: 'Quincy',
    lat: 42.2636,
    lng: -71.0134,
    website: 'https://www.presidentsgc.com',
    walking_allowed: true
  },
  {
    id: 'course-widows-walk',
    name: "Widow's Walk Golf Course",
    city: 'Scituate',
    lat: 42.2084,
    lng: -70.7504,
    website: 'https://www.widowswalkgolf.com',
    walking_allowed: true
  },
  {
    id: 'course-stoneham-oaks',
    name: 'Stoneham Oaks Golf Course',
    city: 'Stoneham',
    lat: 42.4895,
    lng: -71.0957,
    website: 'https://www.stonehamoaks.com',
    walking_allowed: true
  }
]

function buildFixtureTeeTimes() {
  const tomorrow = formatDate(addDays(TODAY, 1))
  const saturday = formatDate(nextWeekday(TODAY, 6))

  return [
    tee('fresh-0830-18', 'course-fresh-pond', tomorrow, '08:30', 18, 4, 42, true),
    tee('fresh-1540-9', 'course-fresh-pond', tomorrow, '15:40', 9, 4, 31, true),
    tee('fresh-0830-9', 'course-fresh-pond', tomorrow, '08:30', 9, 4, 31, true),
    tee('george-0910-18', 'course-george-wright', tomorrow, '09:10', 18, 4, 58, true),
    tee('devine-0850-18', 'course-devine', tomorrow, '08:50', 18, 4, 47, true),
    tee('stoneham-1020-9', 'course-stoneham-oaks', tomorrow, '10:20', 9, 4, 36, true),
    tee('stoneham-1610-9', 'course-stoneham-oaks', tomorrow, '16:10', 9, 4, 36, true),
    tee('granite-0920-18', 'course-granite-links', tomorrow, '09:20', 18, 4, 125, false),
    tee('presidents-1040-18', 'course-presidents', tomorrow, '10:40', 18, 4, 74, true),
    tee('widows-1120-18', 'course-widows-walk', tomorrow, '11:20', 18, 4, 84, true),
    tee('devine-sat-1000-18', 'course-devine', saturday, '10:00', 18, 4, 48, true),
    tee('putterham-sat-1120-18', 'course-putterham', saturday, '11:20', 18, 4, 49, true)
  ]
}

function tee(id, courseId, teeDate, teeTime, holes, spots, price, walkingAllowed) {
  const course = fixtureCourses.find((c) => c.id === courseId)
  return {
    id,
    course_id: courseId,
    course,
    tee_date: teeDate,
    tee_time: teeTime,
    holes,
    available_spots: spots,
    price_per_player: price,
    cart_included: !walkingAllowed,
    walking_allowed: walkingAllowed,
    booking_url: course.website,
    source: 'course_direct',
    scraped_at: new Date().toISOString()
  }
}

const fixtureTeeTimes = buildFixtureTeeTimes()

async function main() {
  const taskFile = JSON.parse(await fs.readFile(tasksPath, 'utf8'))
  const results = []

  for (const task of taskFile.tasks) {
    for (let trial = 1; trial <= TRIALS; trial++) {
      const run = MODE === 'local'
        ? await runLocalTask(task)
        : runFixtureTask(task)
      const graded = await gradeTask(task, run, trial)
      results.push(graded)
      printTaskResult(graded)
    }
  }

  printSummary(results)

  const failed = results.filter((r) => !r.pass)
  if (failed.length > 0) process.exitCode = 1
}

function runFixtureTask(task) {
  const searchInput = task.fixture.searchInput
    ? resolveRelativeSearchInput(task.fixture.searchInput)
    : null

  const events = []
  let searchResults = []

  if (searchInput) {
    events.push({ type: 'tool_call', name: 'search_tee_times', input: searchInput })
    searchResults = searchFixtureTeeTimes(searchInput)
    events.push({
      type: 'tool_result',
      name: 'search_tee_times',
      result: searchResults.length > 0
        ? { tee_times: searchResults, count: searchResults.length }
        : { message: 'No tee times found matching those criteria.' }
    })

    const slotIds = searchResults.slice(0, 2).map((tt) => tt.id)
    if (task.expected.requiresRecommendations && slotIds.length > 0) {
      events.push({ type: 'text', text: task.fixture.finalText })
      events.push({ type: 'tool_call', name: 'recommend_tee_times', input: { slot_ids: slotIds } })
      events.push({ type: 'tool_result', name: 'recommend_tee_times', result: { success: true, slot_ids: slotIds } })
    } else {
      events.push({ type: 'text', text: task.fixture.finalText })
    }
  } else {
    events.push({ type: 'text', text: task.fixture.finalText })
  }

  return eventsToRun(events)
}

async function runLocalTask(task) {
  const messages = task.messages.map((message, index) => ({
    role: 'user',
    content: index === task.messages.length - 1 && task.location
      ? injectLocation(message, task.location)
      : message
  }))

  const response = await fetch(`${BASE_URL.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  })

  if (!response.ok) {
    throw new Error(`Local eval request failed for ${task.id}: HTTP ${response.status}`)
  }
  if (!response.body) throw new Error(`Local eval response had no body for ${task.id}`)

  const events = []
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const raw of parts) {
      const line = raw.split('\n').find((part) => part.startsWith('data: '))
      if (!line) continue
      const data = line.slice(6).trim()
      if (!data || data === '[DONE]') continue
      events.push(JSON.parse(data))
    }
  }

  return eventsToRun(events)
}

function eventsToRun(events) {
  const searchCalls = events.filter((e) => e.type === 'tool_call' && e.name === 'search_tee_times')
  const searchResults = events
    .filter((e) => e.type === 'tool_result' && e.name === 'search_tee_times')
    .flatMap((e) => e.result?.tee_times || [])
  const recommendationResult = [...events]
    .reverse()
    .find((e) => e.type === 'tool_result' && e.name === 'recommend_tee_times')
  const finalText = events
    .filter((e) => e.type === 'text')
    .map((e) => e.text || '')
    .join('')

  return {
    events,
    searchCalls,
    searchResults,
    recommendationIds: recommendationResult?.result?.slot_ids || [],
    finalText
  }
}

async function gradeTask(task, run, trial) {
  const checks = []
  const expected = resolveExpected(task.expected)
  const latestSearch = run.searchCalls.at(-1)?.input || null

  check(checks, 'search trigger', expected.mustSearch ? run.searchCalls.length > 0 : run.searchCalls.length === 0, {
    expected: expected.mustSearch ? 'search_tee_times call' : 'no search_tee_times call',
    actual: `${run.searchCalls.length} search calls`
  })

  if (expected.maxTurns !== undefined) {
    const toolCalls = run.events.filter((e) => e.type === 'tool_call').length
    check(checks, 'tool turn limit', toolCalls <= expected.maxTurns, {
      expected: `<= ${expected.maxTurns}`,
      actual: toolCalls
    })
  }

  if (expected.mustAskExactly) {
    check(checks, 'exact clarification question', run.finalText.trim() === expected.mustAskExactly, {
      expected: expected.mustAskExactly,
      actual: run.finalText.trim()
    })
  }

  if (latestSearch) {
    gradeSearchInput(checks, expected, latestSearch)
  }

  gradeResultConstraints(checks, expected, run.searchResults)
  gradeChatGrounding(checks, task, expected, run)
  await gradeLinks(checks, run.searchResults)

  const pass = checks.every((c) => c.pass)
  return { id: task.id, suite: task.suite, trial, pass, checks, run }
}

function gradeSearchInput(checks, expected, input) {
  if (expected.players !== undefined) exact(checks, 'players param', input.players, expected.players)
  if (expected.holes !== undefined) exact(checks, 'holes param', input.holes, expected.holes)
  if (expected.maxPrice !== undefined) exact(checks, 'max price param', input.max_price, expected.maxPrice)
  if (expected.radiusMiles !== undefined) exact(checks, 'radius param', input.radius_miles, expected.radiusMiles)
  if (expected.timeStart !== undefined) exact(checks, 'time_start param', input.time_start, expected.timeStart)
  if (expected.timeEnd !== undefined) exact(checks, 'time_end param', input.time_end, expected.timeEnd)
  if (expected.date !== undefined) exact(checks, 'date param', input.date || input.date_start, expected.date)

  if (expected.latApprox !== undefined) {
    check(checks, 'lat approx', Math.abs(Number(input.lat) - expected.latApprox) <= 0.02, {
      expected: expected.latApprox,
      actual: input.lat
    })
  }
  if (expected.lngApprox !== undefined) {
    check(checks, 'lng approx', Math.abs(Number(input.lng) - expected.lngApprox) <= 0.02, {
      expected: expected.lngApprox,
      actual: input.lng
    })
  }
}

function gradeResultConstraints(checks, expected, results) {
  if (expected.allowNoResults && results.length === 0) {
    check(checks, 'no results allowed', true)
    return
  }

  if (expected.minResults !== undefined) {
    check(checks, 'minimum results', results.length >= expected.minResults, {
      expected: `>= ${expected.minResults}`,
      actual: results.length
    })
  }

  for (const result of results) {
    if (expected.date) exact(checks, `result ${result.id} date`, result.tee_date, expected.date)
    if (expected.holes !== undefined) exact(checks, `result ${result.id} holes`, result.holes, expected.holes)
    if (expected.players !== undefined) {
      check(checks, `result ${result.id} spots`, result.available_spots >= expected.players, {
        expected: `>= ${expected.players}`,
        actual: result.available_spots
      })
    }
    if (expected.maxPrice !== undefined) {
      check(checks, `result ${result.id} price`, result.price_per_player <= expected.maxPrice, {
        expected: `<= ${expected.maxPrice}`,
        actual: result.price_per_player
      })
    }
    if (expected.timeStart !== undefined) {
      check(checks, `result ${result.id} after start`, result.tee_time >= expected.timeStart, {
        expected: `>= ${expected.timeStart}`,
        actual: result.tee_time
      })
    }
    if (expected.timeEnd !== undefined) {
      check(checks, `result ${result.id} before end`, result.tee_time <= expected.timeEnd, {
        expected: `<= ${expected.timeEnd}`,
        actual: result.tee_time
      })
    }
    if (expected.walkingAllowed !== undefined) {
      exact(checks, `result ${result.id} walking`, result.walking_allowed, expected.walkingAllowed)
    }
  }
}

function gradeChatGrounding(checks, task, expected, run) {
  const text = run.finalText

  check(checks, 'no markdown h3 headers', !/^###\s/m.test(text), {
    expected: 'no ### headers',
    actual: text
  })

  if (expected.mustNotClaimAvailability) {
    const claimsAvailability = /\b(at|available|slot|tee time)\b/i.test(text) && /\b\d{1,2}:\d{2}\b|\bAM\b|\bPM\b/i.test(text)
    check(checks, 'no false availability claim', !claimsAvailability, {
      expected: 'no specific availability claim',
      actual: text
    })
  }

  if (expected.highlightCoursesAnyOf) {
    const matched = expected.highlightCoursesAnyOf.some((name) => text.includes(name))
    check(checks, 'highlights expected fuzzy course', matched, {
      expected: expected.highlightCoursesAnyOf.join(' OR '),
      actual: text
    })
  }

  const resultCourseNames = new Set(run.searchResults.map((r) => r.course?.name).filter(Boolean))
  const knownCourseNames = fixtureCourses.map((c) => c.name)
  const mentionedKnownCourses = knownCourseNames.filter((name) => text.includes(name))
  const fabricated = mentionedKnownCourses.filter((name) => !resultCourseNames.has(name))

  if (run.searchResults.length > 0) {
    check(checks, 'mentioned courses are in results', fabricated.length === 0, {
      expected: 'all mentioned courses returned by search',
      actual: fabricated.join(', ') || 'none'
    })
  }

  if (expected.requiresRecommendations) {
    const resultIds = new Set(run.searchResults.map((r) => r.id))
    check(checks, 'recommendations present', run.recommendationIds.length > 0, {
      expected: 'one or more recommended slot ids',
      actual: run.recommendationIds.join(', ') || 'none'
    })
    check(checks, 'recommendation ids exist', run.recommendationIds.every((id) => resultIds.has(id)), {
      expected: 'all recommended ids in search results',
      actual: run.recommendationIds.join(', ') || 'none'
    })
  }
}

async function gradeLinks(checks, results) {
  const allowedHosts = [
    'freshpondgolf.com',
    'cityofbostongolf.com',
    'brooklinegolf.com',
    'granitelinks.com',
    'presidentsgc.com',
    'widowswalkgolf.com',
    'stonehamoaks.com',
    'golfnow.com',
    'google.com',
    'www.google.com'
  ]

  for (const result of results) {
    let url
    try {
      url = new URL(result.booking_url)
      check(checks, `link ${result.id} valid URL`, true)
    } catch {
      check(checks, `link ${result.id} valid URL`, false, {
        expected: 'absolute URL',
        actual: result.booking_url
      })
      continue
    }

    check(checks, `link ${result.id} allowed host`, allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)), {
      expected: allowedHosts.join(', '),
      actual: url.hostname
    })

    if (CHECK_LINKS) {
      const reachable = await isReachable(url)
      check(checks, `link ${result.id} reachable`, reachable.pass, {
        expected: 'HTTP 2xx/3xx/401/403/405',
        actual: reachable.status
      })
    }
  }
}

async function isReachable(url) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: controller.signal })
    clearTimeout(timer)
    if ([401, 403, 405].includes(response.status) || (response.status >= 200 && response.status < 400)) {
      return { pass: true, status: response.status }
    }
    return { pass: false, status: response.status }
  } catch (err) {
    return { pass: false, status: err instanceof Error ? err.message : String(err) }
  }
}

function searchFixtureTeeTimes(input) {
  return fixtureTeeTimes
    .filter((tt) => {
      if (input.date && tt.tee_date !== input.date) return false
      if (input.date_start && tt.tee_date < input.date_start) return false
      if (input.date_end && tt.tee_date > input.date_end) return false
      if (input.time_start && tt.tee_time < input.time_start) return false
      if (input.time_end && tt.tee_time > input.time_end) return false
      if (input.holes && tt.holes !== input.holes) return false
      if (input.players && tt.available_spots < input.players) return false
      if (input.max_price && tt.price_per_player > input.max_price) return false
      if (input.lat && input.lng && input.radius_miles) {
        const distance = haversineMiles(input.lat, input.lng, tt.course.lat, tt.course.lng)
        if (distance > input.radius_miles) return false
      }
      return true
    })
    .sort((a, b) => a.tee_date.localeCompare(b.tee_date) || a.tee_time.localeCompare(b.tee_time))
    .slice(0, 20)
}

function resolveExpected(expected) {
  const resolved = { ...expected }
  for (const key of ['date']) {
    if (resolved[key]) resolved[key] = resolveDateToken(resolved[key])
  }
  return resolved
}

function resolveRelativeSearchInput(input) {
  const resolved = { ...input }
  for (const key of ['date', 'date_start', 'date_end']) {
    if (resolved[key]) resolved[key] = resolveDateToken(resolved[key])
  }
  return resolved
}

function resolveDateToken(value) {
  if (value === 'today') return formatDate(TODAY)
  if (value === 'tomorrow') return formatDate(addDays(TODAY, 1))
  if (value === 'nextSaturday') return formatDate(nextWeekday(TODAY, 6))
  return value
}

function injectLocation(content, loc) {
  return `[User GPS: ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}]\n${content}`
}

function exact(checks, name, actual, expected) {
  check(checks, name, actual === expected, { expected, actual })
}

function check(checks, name, pass, detail = {}) {
  checks.push({ name, pass, ...detail })
}

function printTaskResult(result) {
  const mark = result.pass ? 'PASS' : 'FAIL'
  console.log(`${mark} ${result.id} trial=${result.trial}`)
  for (const checkResult of result.checks.filter((c) => !c.pass)) {
    console.log(`  - ${checkResult.name}: expected ${stringify(checkResult.expected)}, got ${stringify(checkResult.actual)}`)
  }
}

function printSummary(results) {
  const total = results.length
  const passed = results.filter((r) => r.pass).length
  const bySuite = new Map()
  for (const result of results) {
    const suite = bySuite.get(result.suite) || { total: 0, passed: 0 }
    suite.total += 1
    if (result.pass) suite.passed += 1
    bySuite.set(result.suite, suite)
  }

  console.log('')
  console.log(`Summary: ${passed}/${total} trials passed (${Math.round((passed / total) * 100)}%)`)
  for (const [suite, value] of bySuite) {
    console.log(`  ${suite}: ${value.passed}/${value.total}`)
  }
  console.log(`  mode: ${MODE}`)
  console.log(`  live link checks: ${CHECK_LINKS ? 'on' : 'off'}`)
}

function stringify(value) {
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value.length > 160 ? `${value.slice(0, 157)}...` : value
  return JSON.stringify(value)
}

function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDate(date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date, days) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function nextWeekday(date, targetDay) {
  const currentDay = date.getUTCDay()
  const offset = (targetDay - currentDay + 7) % 7 || 7
  return addDays(date, offset)
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const radius = 3958.8
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(degrees) {
  return (degrees * Math.PI) / 180
}

function getArg(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] || null
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
