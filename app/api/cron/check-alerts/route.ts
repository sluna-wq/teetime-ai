import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { queryTeeTimes } from '@/lib/scraper'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: alerts } = await supabaseAdmin
    .from('alerts')
    .select('*')
    .eq('active', true)

  if (!alerts || alerts.length === 0) {
    return NextResponse.json({ fired: 0 })
  }

  let firedCount = 0

  for (const alert of alerts) {
    try {
      const teeTimes = await queryTeeTimes({
        lat: alert.lat,
        lng: alert.lng,
        radius_miles: alert.radius_miles,
        date_start: alert.date_start || new Date().toISOString().split('T')[0],
        date_end: alert.date_end,
        time_start: alert.time_start,
        time_end: alert.time_end,
        holes: alert.holes,
        max_price: alert.max_price,
        players: alert.players,
        course_ids: alert.course_ids,
      })

      if (teeTimes.length === 0) continue

      // Build email
      const topSlots = teeTimes.slice(0, 5)
      const slotsHtml = topSlots
        .map((tt) => {
          const course = tt.course as { name: string } | null
          return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee">${course?.name || 'Unknown'}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee">${tt.tee_date}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee">${tt.tee_time}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee">$${tt.price_per_player}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee"><a href="${tt.booking_url}" style="color:#16a34a">Book now →</a></td>
          </tr>`
        })
        .join('')

      await resend.emails.send({
        from: 'Tee Time Alert <alerts@yourdomain.com>',
        to: alert.email,
        subject: `⛳ ${teeTimes.length} tee time${teeTimes.length > 1 ? 's' : ''} available matching your alert`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#15803d">Tee times are available!</h2>
            <p>We found <strong>${teeTimes.length} matching tee time${teeTimes.length > 1 ? 's' : ''}</strong> for your alert.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <thead>
                <tr style="background:#f0fdf4">
                  <th style="padding:8px 12px;text-align:left">Course</th>
                  <th style="padding:8px 12px;text-align:left">Date</th>
                  <th style="padding:8px 12px;text-align:left">Time</th>
                  <th style="padding:8px 12px;text-align:left">Price</th>
                  <th style="padding:8px 12px;text-align:left">Book</th>
                </tr>
              </thead>
              <tbody>${slotsHtml}</tbody>
            </table>
            <p style="color:#666;font-size:14px">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/alerts/${alert.id}/cancel" style="color:#ef4444">
                Cancel this alert
              </a>
            </p>
          </div>
        `,
      })

      // Update alert fired count
      await supabaseAdmin
        .from('alerts')
        .update({
          fired_count: (alert.fired_count || 0) + 1,
          last_fired_at: new Date().toISOString(),
        })
        .eq('id', alert.id)

      firedCount++
    } catch (err) {
      console.error(`Alert ${alert.id} error:`, err)
    }
  }

  return NextResponse.json({ fired: firedCount, total: alerts.length })
}
