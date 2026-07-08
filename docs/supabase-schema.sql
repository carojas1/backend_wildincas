create table if not exists public.simot_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.simot_state enable row level security;

drop policy if exists "No public access to simot_state" on public.simot_state;

-- The backend uses SUPABASE_SECRET_KEY from Render.
-- Do not expose this table directly to the browser.
