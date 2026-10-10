-- Shared plans: a link anyone signed in (including anonymous visitors) can
-- open to see a plan and say "I'm in" or "Not that one". The owner shares a
-- snapshot of the plan, never their profile.

create table public.plan_shares (
  token text primary key default encode(gen_random_bytes(12), 'hex'),
  plan_id uuid not null unique,
  owner_id uuid not null references auth.users (id) on delete cascade,
  owner_name text check (char_length(owner_name) <= 60),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_responses (
  token text not null references public.plan_shares (token) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  response text not null check (response in ('in', 'not_that_one')),
  note text check (char_length(note) <= 200),
  updated_at timestamptz not null default now(),
  primary key (token, user_id)
);

alter table public.plan_shares enable row level security;
alter table public.plan_responses enable row level security;
revoke all on public.plan_shares, public.plan_responses from anon, authenticated;
grant select, delete on public.plan_shares to authenticated;
grant select on public.plan_responses to authenticated;
grant all on public.plan_shares, public.plan_responses to service_role;

create policy "owner sees shares" on public.plan_shares
  for select to authenticated using (owner_id = auth.uid());
create policy "owner removes shares" on public.plan_shares
  for delete to authenticated using (owner_id = auth.uid());
create policy "owner and responder see responses" on public.plan_responses
  for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from plan_shares s where s.token = plan_responses.token and s.owner_id = auth.uid()));

-- Creates or refreshes the share for one of the caller's own plans.
create function public.share_plan(p_plan uuid, p_owner_name text, p_snapshot jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if not exists (select 1 from plans where id = p_plan and user_id = auth.uid()) then
    raise exception 'plan not found';
  end if;
  if octet_length(p_snapshot::text) > 20000 then
    raise exception 'plan too large';
  end if;
  insert into plan_shares (plan_id, owner_id, owner_name, snapshot)
  values (p_plan, auth.uid(), left(trim(p_owner_name), 60), p_snapshot)
  on conflict (plan_id) do update
    set snapshot = excluded.snapshot, owner_name = excluded.owner_name, updated_at = now()
    where plan_shares.owner_id = auth.uid()
  returning token into t;
  return t;
end;
$$;

-- The shared plan and everyone's responses, for anyone holding the token.
create function public.get_shared_plan(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'snapshot', s.snapshot,
    'ownerName', s.owner_name,
    'isOwner', s.owner_id = auth.uid(),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object('name', r.display_name, 'response', r.response, 'note', r.note, 'mine', r.user_id = auth.uid()) order by r.updated_at)
      from plan_responses r where r.token = s.token
    ), '[]'::jsonb)
  )
  from plan_shares s
  where s.token = p_token and auth.uid() is not null;
$$;

create function public.respond_shared_plan(p_token text, p_display_name text, p_response text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if not exists (select 1 from plan_shares where token = p_token) then
    raise exception 'share not found';
  end if;
  insert into plan_responses (token, user_id, display_name, response, note)
  values (p_token, auth.uid(), left(trim(p_display_name), 60), p_response, nullif(left(trim(coalesce(p_note, '')), 200), ''))
  on conflict (token, user_id) do update
    set display_name = excluded.display_name, response = excluded.response, note = excluded.note, updated_at = now();
end;
$$;

revoke execute on function public.share_plan(uuid, text, jsonb) from public, anon;
revoke execute on function public.get_shared_plan(text) from public, anon;
revoke execute on function public.respond_shared_plan(text, text, text, text) from public, anon;
grant execute on function public.share_plan(uuid, text, jsonb) to authenticated;
grant execute on function public.get_shared_plan(text) to authenticated;
grant execute on function public.respond_shared_plan(text, text, text, text) to authenticated;
