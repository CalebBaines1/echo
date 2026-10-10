-- Global daily spend on text-to-speech, capped separately from Claude.
-- Server-only: RLS on, no policies, functions callable by the service role.

create table public.voice_spend_daily (
  day date primary key,
  cost_usd numeric(12, 6) not null default 0,
  calls int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.voice_spend_daily enable row level security;
revoke all on public.voice_spend_daily from anon, authenticated;
grant all on public.voice_spend_daily to service_role;

create function public.voice_spend_allows(p_day date, p_cap numeric, p_estimate numeric)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select cost_usd from voice_spend_daily where day = p_day), 0) + p_estimate <= p_cap;
$$;

create function public.voice_spend_add(p_day date, p_cost numeric)
returns numeric
language sql
security definer
set search_path = public
as $$
  insert into voice_spend_daily (day, cost_usd, calls) values (p_day, p_cost, 1)
  on conflict (day) do update
    set cost_usd = voice_spend_daily.cost_usd + excluded.cost_usd,
        calls = voice_spend_daily.calls + 1,
        updated_at = now()
  returning cost_usd;
$$;

revoke execute on function public.voice_spend_allows(date, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.voice_spend_add(date, numeric) from public, anon, authenticated;
grant execute on function public.voice_spend_allows(date, numeric, numeric) to service_role;
grant execute on function public.voice_spend_add(date, numeric) to service_role;
