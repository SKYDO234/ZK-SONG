-- ============================================================================
-- ZK-SONG — Supabase (Postgres) schema
--
-- Only needed when you use the serverless shapes (Vercel / Netlify). A VPS
-- deployment creates its SQLite schema automatically and needs none of this.
--
--   1. Run this file once in the Supabase SQL editor (or `supabase db push`).
--   2. Point DATABASE_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY at the
--      project and deploy the API (DEPLOYMENT.md, shapes B and C).
--
-- The single administrator row is created by the API on first boot from
-- ADMIN_EMAIL / ADMIN_PASSWORD, never by SQL. The API applies the same DDL
-- itself via `create table if not exists`, so running this file is optional —
-- it exists so you can inspect and pre-create everything up front.
-- ============================================================================

-- gen_random_uuid() is core since Postgres 13; no pgcrypto needed.

-- ---------------------------------------------------------------- settings
create table if not exists public.settings (
  key   text primary key,
  value text not null
);

insert into public.settings (key, value) values
  ('site_name', 'ZK-SONG'),
  ('site_tagline', 'Next-Gen Music Publishing, Cloud Mastering & Global Streaming API'),
  ('site_description', 'The professional music-uploading & distribution ecosystem for artists, musicians, and composers. Upload studio tracks, earn the Artist of the Month crown, and stream globally to external music apps via the ZK-SONG REST API.'),
  ('logo_url', ''),
  ('primary_color', '#8b5cf6'),
  ('secondary_color', '#06b6d4'),
  ('accent_badge_text', 'STUDIO CLOUD v2.6'),
  ('contact_email', 'support@zksong.app'),
  ('footer_text', '© 2026 ZK-SONG Music Publishing & API Ecosystem.'),
  ('allow_registration', 'true'),
  ('require_moderation', 'true'),
  ('max_upload_mb', '100')
on conflict (key) do nothing;

-- ------------------------------------------------------------------- users
create table if not exists public.users (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  email                text not null unique,
  password_hash        text not null,
  role                 text not null default 'user' check (role in ('user', 'admin')),
  status               text not null default 'active' check (status in ('active', 'banned')),
  avatar_url           text default '',
  bio                  text default '',
  primary_genre        text default 'Electronic',
  country              text default '',
  website              text default '',
  rejected_songs_count integer not null default 0,
  reset_token          text,
  reset_token_expires  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists users_email_lower_idx on public.users (lower(email));
-- Exactly one administrator may exist at any time.
create unique index if not exists users_single_admin_idx on public.users (role) where role = 'admin';

-- ------------------------------------------------------------------- songs
create table if not exists public.songs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users (id) on delete cascade,
  title              text not null,
  artist             text not null,
  featured_artist    text default '',
  musician           text not null,
  composer           text not null,
  is_cover           boolean not null default false,
  original_credit    text default '',
  genre              text not null default 'Electronic',
  release_year       integer default extract(year from now())::int,
  bpm                integer default 120,
  duration           integer not null default 0,
  duration_formatted text not null default '0:00',
  description        text default '',
  lyrics             text default '',
  audio_url          text not null,
  audio_filename     text not null,
  audio_size         bigint default 0,
  audio_mime         text default 'audio/mpeg',
  thumbnail_url      text not null,
  thumbnail_filename text not null,
  video_url          text default '',
  video_filename     text default '',
  video_size         bigint default 0,
  status             text not null default 'pending' check (status in ('approved', 'pending')),
  plays_count        integer not null default 0,
  downloads_count    integer not null default 0,
  approved_at        timestamptz,
  approved_by        uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists songs_status_idx on public.songs (status);
create index if not exists songs_user_idx on public.songs (user_id);
create index if not exists songs_approved_at_idx on public.songs (approved_at desc);
create index if not exists songs_title_lower_idx on public.songs (lower(title));

-- ---------------------------------------------------------------- api_keys
create table if not exists public.api_keys (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  key_prefix     text not null,
  api_key        text not null unique,
  permissions    text not null default 'read:songs,stream:audio,read:artists',
  status         text not null default 'active' check (status in ('active', 'revoked')),
  requests_count integer not null default 0,
  last_used_at   timestamptz,
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists api_keys_key_idx on public.api_keys (api_key);

-- ----------------------------------------------------------- notifications
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  type       text not null default 'system',
  title      text not null,
  message    text not null,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ------------------------------------------------------------ activity_logs
create table if not exists public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.users (id) on delete set null,
  actor_name  text default 'System',
  action      text not null,
  target_type text default '',
  target_name text default '',
  details     text default '',
  created_at  timestamptz not null default now()
);

create index if not exists activity_logs_created_idx on public.activity_logs (created_at desc);

-- ------------------------------------------------------------ storage bucket
-- Public bucket for audio, covers, videos, avatars and branding.
-- The API also creates this itself on first upload (api/_lib/storage/supabase.js),
-- so running this file is optional.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 120000000)
on conflict (id) do update set public = true, file_size_limit = 120000000;

-- Everyone may read public media; writes happen through the service-role key
-- used by the edge function, which bypasses RLS.
drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects
  for select using (bucket_id = 'media');

-- ---------------------------------------------------------------- hardening
-- All application tables are accessed exclusively by the edge function with the
-- service-role key, so RLS stays enabled with no anon policies: the anon key
-- can neither read password hashes nor mutate rows.
alter table public.users          enable row level security;
alter table public.songs           enable row level security;
alter table public.api_keys        enable row level security;
alter table public.notifications   enable row level security;
alter table public.activity_logs   enable row level security;
alter table public.settings        enable row level security;
