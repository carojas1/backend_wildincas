create table if not exists public.simot_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.simot_state enable row level security;

drop policy if exists "No public access to simot_state" on public.simot_state;

-- The backend uses SUPABASE_SECRET_KEY from Render.
-- Do not expose this table directly to the browser.

-- Isolated persistence per microservice.
-- Each table represents the private data store of one service.
create table if not exists public.simot_auth (
  id text primary key default 'state',
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.simot_rooms (
  id text primary key default 'state',
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.simot_guests (
  id text primary key default 'state',
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.simot_operations (
  id text primary key default 'state',
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.simot_finance (
  id text primary key default 'state',
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.simot_employees (
  id text primary key default 'state',
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.simot_notifications (
  id text primary key default 'state',
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.simot_reservations (
  id text primary key default 'state',
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.simot_auth enable row level security;
alter table public.simot_rooms enable row level security;
alter table public.simot_guests enable row level security;
alter table public.simot_operations enable row level security;
alter table public.simot_finance enable row level security;
alter table public.simot_employees enable row level security;
alter table public.simot_notifications enable row level security;
alter table public.simot_reservations enable row level security;

-- Optional migration from the initial shared table to isolated service tables.
insert into public.simot_auth (id, value, updated_at)
select 'state', value, updated_at from public.simot_state where key = 'auth'
on conflict (id) do nothing;

insert into public.simot_rooms (id, value, updated_at)
select 'state', value, updated_at from public.simot_state where key = 'rooms'
on conflict (id) do nothing;

insert into public.simot_guests (id, value, updated_at)
select 'state', value, updated_at from public.simot_state where key = 'guests'
on conflict (id) do nothing;

insert into public.simot_operations (id, value, updated_at)
select 'state', value, updated_at from public.simot_state where key = 'operations'
on conflict (id) do nothing;

insert into public.simot_finance (id, value, updated_at)
select 'state', value, updated_at from public.simot_state where key = 'finance'
on conflict (id) do nothing;

insert into public.simot_employees (id, value, updated_at)
select 'state', value, updated_at from public.simot_state where key = 'employees'
on conflict (id) do nothing;

insert into public.simot_notifications (id, value, updated_at)
select 'state', value, updated_at from public.simot_state where key = 'notifications'
on conflict (id) do nothing;

insert into public.simot_reservations (id, value, updated_at)
select 'state', value, updated_at from public.simot_state where key = 'reservations'
on conflict (id) do nothing;
