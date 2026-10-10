-- Echo schema. Every visitor gets a Supabase user (anonymous until they add
-- an email), so all user data is keyed by auth.users.id and protected by RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- User data

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text,
  -- The app's EchoProfile: tastes, activities, preferences, area, summary.
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plans_user_created on public.plans (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Friends: a group is a set of people who plan together. Joining needs the
-- group's invite token.

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  invite_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user on public.group_members (user_id);

-- ---------------------------------------------------------------------------
-- Server-only tables. RLS is on with no policies, so only the service role
-- (used by API routes) can touch them.

create table public.qloo_cache (
  key text primary key,
  request text not null,
  value jsonb not null,
  stored_at timestamptz not null,
  expires_at timestamptz not null
);

create table public.qloo_budget (
  id int primary key default 1 check (id = 1),
  day text not null,
  calls_today int not null default 0,
  month_limit int,
  month_remaining int,
  updated_at timestamptz not null default now()
);

create table public.usage_daily (
  user_id uuid not null,
  day date not null,
  kind text not null,
  count int not null default 0,
  primary key (user_id, day, kind)
);

-- ---------------------------------------------------------------------------
-- Row level security

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.qloo_cache enable row level security;
alter table public.qloo_budget enable row level security;
alter table public.usage_daily enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own plans" on public.plans
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Security definer so policies on group_members don't recurse.
create function public.is_group_member(p_group uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from group_members where group_id = p_group and user_id = auth.uid());
$$;

create policy "members see their groups" on public.groups
  for select to authenticated
  using (owner_id = auth.uid() or public.is_group_member(id));

create policy "owner deletes group" on public.groups
  for delete to authenticated
  using (owner_id = auth.uid());

create policy "members see each other" on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

create policy "members leave" on public.group_members
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Group functions. Creating and joining go through these so invite tokens
-- are checked server-side.

create function public.create_group(p_display_name text)
returns table (group_id uuid, invite_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  g groups;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into groups (owner_id) values (auth.uid()) returning * into g;
  insert into group_members (group_id, user_id, display_name) values (g.id, auth.uid(), left(trim(p_display_name), 60));
  return query select g.id, g.invite_token;
end;
$$;

create function public.join_group(p_token text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select id into gid from groups where invite_token = p_token;
  if gid is null then
    raise exception 'invite not found';
  end if;
  insert into group_members (group_id, user_id, display_name)
  values (gid, auth.uid(), left(trim(p_display_name), 60))
  on conflict (group_id, user_id) do update set display_name = excluded.display_name;
  return gid;
end;
$$;

-- What group members share with each other: display name, tastes (names and
-- Qloo entity IDs only), and which hobbies they do. Preferences, notes,
-- location and plans stay private.
create function public.group_people(p_group uuid)
returns table (user_id uuid, display_name text, tastes jsonb, hobby_ids jsonb)
language sql
security definer
stable
set search_path = public
as $$
  select
    m.user_id,
    m.display_name,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', t->>'key',
        'name', t->>'name',
        'type', t->>'type',
        'status', t->>'status',
        'entity', case when t ? 'entity' then jsonb_build_object('id', t->'entity'->>'id', 'name', t->'entity'->>'name', 'type', t->'entity'->>'type') end
      ))
      from jsonb_array_elements(coalesce(p.data->'tastes', '[]'::jsonb)) t
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(a->>'hobbyId')
      from jsonb_array_elements(coalesce(p.data->'activities', '[]'::jsonb)) a
      where a ? 'hobbyId' and a->>'status' <> 'used_to'
    ), '[]'::jsonb)
  from group_members m
  left join profiles p on p.user_id = m.user_id
  where m.group_id = p_group and public.is_group_member(p_group);
$$;

-- ---------------------------------------------------------------------------
-- Server-only counters. Atomic, so concurrent serverless functions can't
-- overspend.

create function public.increment_usage(p_user uuid, p_kind text, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  insert into usage_daily (user_id, day, kind, count)
  values (p_user, current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update set count = usage_daily.count + 1
  returning count into n;
  return n <= p_limit;
end;
$$;

-- Reserves one live Qloo call. Returns 'ok', 'daily_cap' or 'reserve'.
create function public.qloo_reserve(p_day text, p_daily_cap int, p_monthly_reserve int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  b qloo_budget;
begin
  insert into qloo_budget (id, day) values (1, p_day) on conflict (id) do nothing;
  select * into b from qloo_budget where id = 1 for update;
  if b.day <> p_day then
    b.day := p_day;
    b.calls_today := 0;
  end if;
  if b.calls_today >= p_daily_cap then
    update qloo_budget set day = b.day, calls_today = b.calls_today, updated_at = now() where id = 1;
    return 'daily_cap';
  end if;
  if b.month_remaining is not null and b.month_remaining <= p_monthly_reserve then
    return 'reserve';
  end if;
  update qloo_budget
  set day = b.day,
      calls_today = b.calls_today + 1,
      month_remaining = case when b.month_remaining is null then null else b.month_remaining - 1 end,
      updated_at = now()
  where id = 1;
  return 'ok';
end;
$$;

create function public.qloo_record(p_remaining int, p_limit int)
returns void
language sql
security definer
set search_path = public
as $$
  update qloo_budget
  set month_remaining = coalesce(p_remaining, month_remaining),
      month_limit = coalesce(p_limit, month_limit),
      updated_at = now()
  where id = 1;
$$;

revoke execute on function public.increment_usage(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.qloo_reserve(text, int, int) from public, anon, authenticated;
revoke execute on function public.qloo_record(int, int) from public, anon, authenticated;
grant execute on function public.increment_usage(uuid, text, int) to service_role;
grant execute on function public.qloo_reserve(text, int, int) to service_role;
grant execute on function public.qloo_record(int, int) to service_role;

revoke execute on function public.create_group(text) from public, anon;
revoke execute on function public.join_group(text, text) from public, anon;
revoke execute on function public.group_people(uuid) from public, anon;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text, text) to authenticated;
grant execute on function public.group_people(uuid) to authenticated;
