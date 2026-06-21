-- User data table: one row per user
create table user_data (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  movies      jsonb not null default '[]',
  watchlist   jsonb not null default '[]',
  maybe       jsonb not null default '[]',
  meh         jsonb not null default '[]',
  banned      jsonb not null default '[]',
  standards   jsonb not null default '[]',
  watch_log   jsonb not null default '[]',
  total_cost  numeric(12,6) not null default 0,
  updated_at  timestamptz not null default now()
);

-- Snapshots table
create table snapshots (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  ts          bigint not null,
  label       text,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);
create index on snapshots(user_id, ts desc);

-- Taste profiles: one per user
create table taste_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  prompt_section text,
  updated_at    timestamptz not null default now()
);

-- AI gate + spend tracking columns (migration — safe to run on existing DB)
alter table user_data
  add column if not exists ai_enabled      boolean       not null default true,
  add column if not exists spend_month     numeric(10,6) not null default 0,
  add column if not exists spend_cap       numeric(10,6) not null default 3.0,
  add column if not exists spend_month_key text          not null default '',
  add column if not exists rec_movies      boolean       not null default true,
  add column if not exists rec_tv          boolean       not null default true;

-- Row Level Security
alter table user_data enable row level security;
alter table snapshots enable row level security;
alter table taste_profiles enable row level security;

create policy "own data" on user_data for all using (auth.uid() = user_id);
create policy "own snapshots" on snapshots for all using (auth.uid() = user_id);
create policy "own taste" on taste_profiles for all using (auth.uid() = user_id);
