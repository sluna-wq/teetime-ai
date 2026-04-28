-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Courses (static info, refresh weekly)
create table if not exists courses (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  address text not null,
  city text not null,
  lat double precision not null,
  lng double precision not null,
  phone text,
  website text,
  golfnow_facility_id text,
  golfnow_slug text,
  holes_available integer[] default '{9,18}',
  walking_allowed boolean default true,
  price_range text default '$$',
  price_min numeric(8,2),
  price_max numeric(8,2),
  description text,
  image_url text,
  updated_at timestamptz default now()
);

-- Tee times (live data, refresh every 30 min)
create table if not exists tee_times (
  id uuid primary key default uuid_generate_v4(),
  course_id uuid references courses(id) on delete cascade,
  tee_date date not null,
  tee_time time not null,
  holes integer not null default 18,
  available_spots integer not null default 4,
  price_per_player numeric(8,2) not null,
  cart_included boolean default false,
  walking_allowed boolean default true,
  booking_url text not null,
  source text not null default 'golfnow',
  scraped_at timestamptz default now(),
  unique(course_id, tee_date, tee_time, holes)
);

-- Index for fast tee time queries
create index if not exists tee_times_date_idx on tee_times(tee_date);
create index if not exists tee_times_course_idx on tee_times(course_id);
create index if not exists tee_times_price_idx on tee_times(price_per_player);
create index if not exists tee_times_scraped_idx on tee_times(scraped_at);

-- Alerts
create table if not exists alerts (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  lat double precision,
  lng double precision,
  radius_miles integer default 25,
  date_start date,
  date_end date,
  time_start time,
  time_end time,
  holes integer,
  max_price numeric(8,2),
  players integer,
  course_ids uuid[],
  active boolean default true,
  fired_count integer default 0,
  last_fired_at timestamptz,
  created_at timestamptz default now()
);

-- Scrape log (for debugging)
create table if not exists scrape_logs (
  id uuid primary key default uuid_generate_v4(),
  started_at timestamptz default now(),
  finished_at timestamptz,
  courses_attempted integer default 0,
  tee_times_found integer default 0,
  tee_times_inserted integer default 0,
  errors jsonb default '[]'
);

-- RLS: allow public read of courses and tee_times
alter table courses enable row level security;
alter table tee_times enable row level security;
alter table alerts enable row level security;

create policy "public can read courses" on courses for select using (true);
create policy "public can read tee_times" on tee_times for select using (true);
create policy "anyone can insert alerts" on alerts for insert with check (true);
create policy "own alerts readable" on alerts for select using (true);
