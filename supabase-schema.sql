-- ==============================================================================
-- JTEC MUSIC — SUPABASE DATABASE & STORAGE INITIALIZATION SCRIPT
-- ==============================================================================
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query).
-- It creates the 'songs' table with all required fields, performance indexes,
-- and Row Level Security (RLS) policies for public browser access.
-- ==============================================================================

-- 1. Create the songs table
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text default 'Unknown Artist',
  album text default 'Single',
  genre text default 'Music',
  duration numeric default 0,
  file_name text not null,
  file_path text not null,
  file_size bigint not null default 0,
  audio_url text not null,
  cover_url text,
  file_hash text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Indexes for fast search, duplicate detection, and chronological sorting
create index if not exists idx_songs_file_hash on public.songs (file_hash);
create index if not exists idx_songs_created_at on public.songs (created_at desc);
create index if not exists idx_songs_title on public.songs (title);
create index if not exists idx_songs_artist on public.songs (artist);

-- 3. Enable Row Level Security (RLS)
alter table public.songs enable row level security;

-- 4. Define public RLS policies (using public Anon key)
-- Allow anyone to read song metadata
drop policy if exists "Allow public read on songs" on public.songs;
create policy "Allow public read on songs"
  on public.songs for select
  using (true);

-- Allow anyone to insert songs
drop policy if exists "Allow public insert on songs" on public.songs;
create policy "Allow public insert on songs"
  on public.songs for insert
  with check (true);

-- Allow anyone to update songs
drop policy if exists "Allow public update on songs" on public.songs;
create policy "Allow public update on songs"
  on public.songs for update
  using (true)
  with check (true);

-- Allow anyone to delete songs
drop policy if exists "Allow public delete on songs" on public.songs;
create policy "Allow public delete on songs"
  on public.songs for delete
  using (true);

-- ==============================================================================
-- STORAGE BUCKETS CONFIGURATION INSTRUCTIONS:
-- ==============================================================================
-- 1. In your Supabase Dashboard, navigate to 'Storage' in the left menu.
-- 2. Click 'New bucket'.
-- 3. Name the bucket: music
-- 4. Toggle 'Public bucket' to ON (so audio streams can be read by HTMLAudioElement / Web Audio API).
-- 5. Click 'Save bucket'.
-- 6. (Optional) Repeat the process to create another public bucket named: artwork
-- 7. Ensure storage policies permit Select and Insert for anon users on these buckets.
-- ==============================================================================
