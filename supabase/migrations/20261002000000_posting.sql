-- Posting backend. Only Edge Functions (service role) touch these tables: RLS is on and no policies exist.
create table public.connected_accounts (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('youtube','tiktok','instagram','facebook','x')),
  account_id text not null,
  display_name text not null,
  avatar_url text,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  scopes text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, platform)
);
create table public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  code_verifier text not null,
  return_url text not null,
  expires_at timestamptz not null
);
create table public.post_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  platform_ref jsonb not null default '{}'::jsonb,
  input jsonb not null default '{}'::jsonb,
  status text not null default 'uploading' check (status in ('uploading','publishing','processing','done','failed')),
  url text,
  error text,
  created_at timestamptz not null default now()
);
alter table public.connected_accounts enable row level security;
alter table public.oauth_states enable row level security;
alter table public.post_sessions enable row level security;
revoke all on public.connected_accounts, public.oauth_states, public.post_sessions from anon, authenticated;
-- Not every project auto-grants new tables to service_role (it bypasses RLS but still needs privileges); make it explicit.
grant all on public.connected_accounts, public.oauth_states, public.post_sessions to service_role;