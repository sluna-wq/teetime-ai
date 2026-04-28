import { supabaseAdmin } from './supabase'
import { BOSTON_COURSES } from './courses'

export async function seedCourses() {
  console.log(`Seeding ${BOSTON_COURSES.length} courses...`)
  const { data, error } = await supabaseAdmin
    .from('courses')
    .upsert(BOSTON_COURSES, { onConflict: 'slug' })
    .select()

  if (error) {
    console.error('Seed error:', error)
    throw error
  }
  console.log(`Seeded ${data?.length} courses`)
  return data
}
