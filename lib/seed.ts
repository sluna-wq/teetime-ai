import { supabaseAdmin } from './supabase'
import { BOSTON_COURSES } from './courses'

export async function seedCourses() {
  console.log(`Seeding ${BOSTON_COURSES.length} courses...`)
  // Strip fields not in the DB schema (quality_tier, characteristics live in code/system prompt)
  const rows = BOSTON_COURSES.map((course) => {
    const { quality_tier, characteristics, ...row } = course
    void quality_tier
    void characteristics
    return row
  })
  const { data, error } = await supabaseAdmin
    .from('courses')
    .upsert(rows, { onConflict: 'slug' })
    .select()

  if (error) {
    console.error('Seed error:', error)
    throw error
  }
  console.log(`Seeded ${data?.length} courses`)
  return data
}
