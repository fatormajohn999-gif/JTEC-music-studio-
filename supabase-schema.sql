-- ==============================================================================
-- JTEC MUSIC — SUPABASE DATABASE & STORAGE INITIALIZATION SCRIPT
-- ==============================================================================
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query).
-- It creates the 'songs' table with all required fields, performance indexes,
-- public Storage buckets ('music' and 'artwork'), and Row Level Security policies.
-- ==============================================================================

-- 1. Create the songs table with both storage_path/file_path and public_url/audio_url support
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text default 'Unknown Artist',
  album text default 'Single',
  genre text default 'Music',
  duration numeric default 0,
  file_name text not null,
  storage_path text not null default '',
  file_path text not null default '',
  file_size bigint not null default 0,
  file_type text default 'audio/mpeg',
  public_url text not null default '',
  audio_url text not null default '',
  artwork_url text,
  cover_url text,
  file_hash text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Safe column migrations for existing 'songs' tables (adds any missing columns without data loss)
alter table public.songs add column if not exists storage_path text not null default '';
alter table public.songs add column if not exists file_path text not null default '';
alter table public.songs add column if not exists public_url text not null default '';
alter table public.songs add column if not exists audio_url text not null default '';
alter table public.songs add column if not exists artwork_url text;
alter table public.songs add column if not exists cover_url text;
alter table public.songs add column if not exists file_type text default 'audio/mpeg';
alter table public.songs add column if not exists genre text default 'Music';
alter table public.songs add column if not exists file_hash text;
alter table public.songs add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now()) not null;

-- 2. Indexes for fast search, duplicate detection, and chronological sorting
create index if not exists idx_songs_file_hash on public.songs (file_hash);
create index if not exists idx_songs_created_at on public.songs (created_at desc);
create index if not exists idx_songs_title on public.songs (title);
create index if not exists idx_songs_artist on public.songs (artist);

-- 3. Enable Row Level Security (RLS)
alter table public.songs enable row level security;

-- 4. Define public RLS policies
drop policy if exists "Allow public read on songs" on public.songs;
create policy "Allow public read on songs"
  on public.songs for select
  using (true);

drop policy if exists "Allow public insert on songs" on public.songs;
create policy "Allow public insert on songs"
  on public.songs for insert
  with check (true);

drop policy if exists "Allow public update on songs" on public.songs;
create policy "Allow public update on songs"
  on public.songs for update
  using (true)
  with check (true);

drop policy if exists "Allow public delete on songs" on public.songs;
create policy "Allow public delete on songs"
  on public.songs for delete
  using (true);

-- 5. Storage Bucket for Music (creates dedicated public bucket with no bucket-level size limits)
insert into storage.buckets (id, name, public, file_size_limit)
values ('music', 'music', true, null)
on conflict (id) do update set public = true, file_size_limit = null;

-- 6. Storage Access Policies for 'music' bucket (explicitly granted to public)
drop policy if exists "Public Access music" on storage.objects;
create policy "Public Access music"
  on storage.objects for select
  to public
  using (bucket_id = 'music');

drop policy if exists "Public Upload music" on storage.objects;
create policy "Public Upload music"
  on storage.objects for insert
  to public
  with check (bucket_id = 'music');

drop policy if exists "Public Update music" on storage.objects;
create policy "Public Update music"
  on storage.objects for update
  to public
  using (bucket_id = 'music')
  with check (bucket_id = 'music');

drop policy if exists "Public Delete music" on storage.objects;
create policy "Public Delete music"
  on storage.objects for delete
  to public
  using (bucket_id = 'music');

