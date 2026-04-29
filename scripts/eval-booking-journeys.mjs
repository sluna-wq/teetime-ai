#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const journeysPath = path.join(repoRoot, 'evals', 'booking-journeys.json')

const MODE = process.env.BOOKING_EVAL_MODE || getArg('--mode') || 'fixture'
const TODAY = parseDate(process.env.EVAL_TODAY || new Date().toISOString().slice(0, 10))
const HEADLESS = process.env.BOOKING_HEADLESS !== '0'

async function main() {
  const suite = JSON.parse(await fs.readFile(journeysPath, 'utf8'))
  const results = []

  for (const journey of suite.journeys) {
    const result = MODE === 'browser'
      ? await runBrowserJourney(journey)
      : validateJourneySpec(journey)
    results.push(result)
    printResult(result)
  }

  const passed = results.filter((r) => r.pass).length
  console.log('')
  console.log(`Booking journey summary: ${passed}/${results.length} passed`)
  console.log(`mode: ${MODE}`)

  if (passed !== results.length) process.exitCode = 1
}

function validateJourneySpec(journey) {
  const checks = []
  check(checks, 'has course', Boolean(journey.course), journey.course)
  check(checks, 'has entry URL', isUrl(journey.entryUrl), journey.entryUrl)
  check(checks, 'has agent goal', Boolean(journey.agentGoal?.includes('stop before')), journey.agentGoal)
  check(checks, 'has target date', Boolean(resolveDateToken(journey.target?.date)), journey.target?.date)
  check(checks, 'has target time', /^\d{2}:\d{2}$/.test(journey.target?.time || ''), journey.target?.time)
  check(checks, 'has player count', Number.isInteger(journey.target?.players), journey.target?.players)
  check(checks, 'has provider', Boolean(journey.provider), journey.provider)
  check(checks, 'has capability', Boolean(journey.capability), journey.capability)
  check(checks, 'has course success signals', Array.isArray(journey.successSignals?.courseNameAnyOf) && journey.successSignals.courseNameAnyOf.length > 0, journey.successSignals?.courseNameAnyOf)
  check(checks, 'has booking success signals', Array.isArray(journey.successSignals?.bookingIntentAnyOf) && journey.successSignals.bookingIntentAnyOf.length > 0, journey.successSignals?.bookingIntentAnyOf)
  check(checks, 'has no-submit boundary', Array.isArray(journey.successSignals?.stopBeforeAnyOf) && journey.successSignals.stopBeforeAnyOf.length > 0, journey.successSignals?.stopBeforeAnyOf)

  return {
    id: journey.id,
    pass: checks.every((c) => c.pass),
    checks
  }
}

async function runBrowserJourney(journey) {
  const checks = []
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: HEADLESS })
  const page = await browser.newPage()
  const trace = []

  try {
    await page.goto(journey.entryUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    trace.push({ action: 'goto', url: page.url(), title: await page.title() })

    await acceptCookieBannerIfPresent(page, trace)
    await clickLikelyBookingEntry(page, trace)
    await settle(page)

    if (journey.directBookingUrl) {
      await page.goto(journey.directBookingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      trace.push({ action: 'direct booking fallback', url: page.url(), title: await page.title() })
      await settle(page)
    }

    const snapshot = await collectPageEvidence(page)
    const targetDate = resolveDateToken(journey.target.date)

    check(checks, 'opened booking-related surface', isBookingSurface(snapshot, journey), snapshot.summary)
    check(checks, 'course context present', includesAny(snapshot.haystack, journey.successSignals.courseNameAnyOf), snapshot.summary)
    if (journey.successSignals.targetEvidenceAnyOf) {
      check(checks, 'target evidence present', includesAny(snapshot.haystack, journey.successSignals.targetEvidenceAnyOf), snapshot.summary)
    }
    check(checks, 'did not reach prohibited final step', !includesAny(snapshot.haystack, journey.successSignals.stopBeforeAnyOf), snapshot.summary)

    const dateEvidence = await trySetOrOpenDateContext(page, targetDate, journey, trace)
    const afterDateSnapshot = await collectPageEvidence(page)
    check(
      checks,
      'date context attempted',
      dateEvidence.attempted || dateEvidence.visible,
      dateEvidence.reason
    )
    check(
      checks,
      'target date visible or date control reached',
      dateEvidence.visible || hasDateContext(afterDateSnapshot, targetDate),
      afterDateSnapshot.summary
    )
  } catch (err) {
    check(checks, 'browser journey completed without runtime error', false, err instanceof Error ? err.message : String(err))
  } finally {
    await browser.close()
  }

  return {
    id: journey.id,
    pass: checks.every((c) => c.pass),
    checks,
    trace
  }
}

async function acceptCookieBannerIfPresent(page, trace) {
  const candidates = ['Accept', 'I Accept', 'Agree', 'Got it', 'Allow all']
  for (const label of candidates) {
    const button = page.getByRole('button', { name: label, exact: false })
    if (await button.count().catch(() => 0)) {
      await button.first().click({ timeout: 2000 }).catch(() => {})
      trace.push({ action: 'cookie', label })
      return
    }
  }
}

async function clickLikelyBookingEntry(page, trace) {
  const hrefCandidates = [
    'a[href*="tee" i]',
    'a[href*="book" i]',
    'a[href*="reserve" i]',
    'a[href*="foreup" i]',
    'a[href*="chronogolf" i]',
    'a[href*="golfnow" i]'
  ]

  for (const selector of hrefCandidates) {
    const candidate = page.locator(selector).filter({ hasText: /book|tee|reserve|time/i })
    const count = await candidate.count().catch(() => 0)
    if (count > 0) {
      const href = await candidate.first().getAttribute('href').catch(() => null)
      await Promise.allSettled([
        page.waitForLoadState('domcontentloaded', { timeout: 10000 }),
        candidate.first().click({ timeout: 5000 })
      ])
      trace.push({ action: 'click booking href candidate', selector, href, url: page.url() })
      return
    }
  }

  const labels = [
    'Book a Tee Time',
    'Book Tee Times',
    'Book Tee Time',
    'Tee Times',
    'Reserve',
    'Book Now',
    'Online Tee Times'
  ]

  for (const label of labels) {
    const link = page.getByRole('link', { name: label, exact: false })
    if ((await link.count().catch(() => 0)) > 0) {
      await Promise.allSettled([
        page.waitForLoadState('domcontentloaded', { timeout: 10000 }),
        link.first().click({ timeout: 5000 })
      ])
      trace.push({ action: 'click booking link', label, url: page.url() })
      return
    }

    const button = page.getByRole('button', { name: label, exact: false })
    if ((await button.count().catch(() => 0)) > 0) {
      await button.first().click({ timeout: 5000 })
      trace.push({ action: 'click booking button', label, url: page.url() })
      return
    }
  }

  trace.push({ action: 'booking entry not clicked', url: page.url() })
}

async function trySetOrOpenDateContext(page, targetDate, journey, trace) {
  const current = await collectPageEvidence(page)

  if (hasDateContext(current, targetDate)) {
    return { attempted: true, visible: true, reason: `target date already visible: ${targetDate}` }
  }

  if (journey.provider === 'foreup' || journey.provider === 'cps') {
    const providerEvidence = await tryProviderCalendarDate(page, targetDate, journey.provider, trace)
    if (providerEvidence.visible || providerEvidence.attempted) return providerEvidence
  }

  const labels = ['Date', 'Select Date', 'Choose Date', 'Tee Date']
  for (const label of labels) {
    const control = page.getByLabel(label, { exact: false })
    if ((await control.count().catch(() => 0)) > 0) {
      const first = control.first()
      await first.click({ timeout: 5000 }).catch(() => {})
      await first.fill(targetDate, { timeout: 3000 }).catch(() => {})
      trace.push({ action: 'date control', label, value: targetDate })
      return { attempted: true, visible: false, reason: `used date control labelled ${label}` }
    }
  }

  const dateLike = page.locator('input[type="date"], input[name*="date" i], input[placeholder*="date" i]')
  if ((await dateLike.count().catch(() => 0)) > 0) {
    const first = dateLike.first()
    await first.fill(targetDate, { timeout: 3000 }).catch(async () => {
      await first.click({ timeout: 3000 }).catch(() => {})
    })
    trace.push({ action: 'date input', value: targetDate })
    return { attempted: true, visible: false, reason: 'used date-like input' }
  }

  const dateButton = page.getByText(/date|calendar|today|tomorrow/i)
  if ((await dateButton.count().catch(() => 0)) > 0) {
    await dateButton.first().click({ timeout: 3000 }).catch(() => {})
    trace.push({ action: 'opened date-like control' })
    return { attempted: true, visible: false, reason: 'opened date-like control' }
  }

  return { attempted: false, visible: false, reason: 'no date control found' }
}

async function tryProviderCalendarDate(page, targetDate, provider, trace) {
  const date = parseDate(targetDate)
  const day = String(date.getUTCDate())
  const before = await collectPageEvidence(page)

  if (hasCalendarMonthAndDay(before, targetDate)) {
    return {
      attempted: true,
      visible: true,
      reason: `${provider} calendar shows target month/day`
    }
  }

  const dayCell = page.getByText(day, { exact: true })
  const count = await dayCell.count().catch(() => 0)
  if (count > 0) {
    await dayCell.first().click({ timeout: 3000 }).catch(() => {})
    trace.push({ action: `${provider} calendar day click`, day, count })
    await settle(page)

    const after = await collectPageEvidence(page)
    return {
      attempted: true,
      visible: hasDateContext(after, targetDate) || hasCalendarMonthAndDay(after, targetDate),
      reason: `${provider} calendar day ${day} clicked`
    }
  }

  return { attempted: false, visible: false, reason: `${provider} calendar day ${day} not found` }
}

async function collectPageEvidence(page) {
  const title = await page.title().catch(() => '')
  const url = page.url()
  const visibleText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')
  const haystack = `${title}\n${url}\n${visibleText}`.toLowerCase()
  return {
    title,
    url,
    haystack,
    summary: `${title} ${url} ${visibleText.slice(0, 500)}`.replace(/\s+/g, ' ')
  }
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
}

function includesAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(String(needle).toLowerCase()))
}

function hasDateContext(snapshot, targetDate) {
  const date = parseDate(targetDate)
  const human = formatHumanDate(date).toLowerCase()
  const compactHuman = formatCompactHumanDate(date).toLowerCase()
  return snapshot.haystack.includes(targetDate) ||
    snapshot.haystack.includes(human) ||
    snapshot.haystack.includes(compactHuman) ||
    hasCalendarMonthAndDay(snapshot, targetDate)
}

function hasCalendarMonthAndDay(snapshot, targetDate) {
  const date = parseDate(targetDate)
  const monthYear = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date).toLowerCase()
  const day = String(date.getUTCDate())
  const dayPattern = new RegExp(`(^|\\D)${escapeRegExp(day)}($|\\D)`)
  return snapshot.haystack.includes(monthYear) && dayPattern.test(snapshot.haystack)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isBookingSurface(snapshot, journey) {
  return includesAny(snapshot.haystack, journey.successSignals.bookingIntentAnyOf) ||
    includesAny(snapshot.haystack, ['search results', 'tee time search', 'available', 'unavailable']) ||
    includesAny(snapshot.haystack, journey.successSignals.targetEvidenceAnyOf || [])
}

function check(checks, name, pass, actual) {
  checks.push({ name, pass, actual })
}

function printResult(result) {
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.id}`)
  for (const failed of result.checks.filter((c) => !c.pass)) {
    console.log(`  - ${failed.name}: ${stringify(failed.actual)}`)
  }
}

function stringify(value) {
  if (typeof value === 'string') return value.length > 220 ? `${value.slice(0, 217)}...` : value
  return JSON.stringify(value)
}

function isUrl(value) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function resolveDateToken(value) {
  if (value === 'today') return formatDate(TODAY)
  if (value === 'tomorrow') return formatDate(addDays(TODAY, 1))
  if (value === 'nextSaturday') return formatDate(nextWeekday(TODAY, 6))
  return value
}

function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDate(date) {
  return date.toISOString().slice(0, 10)
}

function formatHumanDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date)
}

function formatCompactHumanDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date)
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

function getArg(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] || null
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
