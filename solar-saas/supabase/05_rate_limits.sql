-- PROINVENTIVE Solar - 5/5 - shared rate limiting across every server instance.
-- The in-memory limiter only protects one process. Behind a load balancer or on
-- serverless each instance had its own counter, so the real limit was N times higher.
--
-- One row per key holds the timestamps of recent hits. The array is trimmed on every
-- call, so it never grows past the limit (about 20 entries at most).
-- SELECT FOR UPDATE serialises concurrent calls for the same key, which is what makes
-- the count correct when many requests arrive at once.

create table if not exists public.rate_limits (
  key        text primary key,
  hits       timestamptz[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
-- No policy on purpose: only the service role (which bypasses RLS) may touch this table.

create index if not exists rate_limits_updated_idx on public.rate_limits (updated_at);

create or replace function public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns table (out_allowed boolean, out_remaining int, out_retry_after int)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_now    timestamptz := now();
  v_cutoff timestamptz;
  v_hits   timestamptz[];
  v_count  int;
  v_oldest timestamptz;
begin
  if p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    return query select true, 0, 0;
    return;
  end if;

  v_cutoff := v_now - make_interval(secs => p_window_seconds);

  -- Housekeeping: drop keys nobody has touched for a day. Runs rarely so it stays cheap.
  if random() < 0.01 then
    delete from public.rate_limits where updated_at < v_now - interval '1 day';
  end if;

  insert into public.rate_limits (key, hits, updated_at)
       values (p_key, '{}', v_now)
  on conflict (key) do nothing;

  select rl.hits into v_hits
    from public.rate_limits rl
   where rl.key = p_key
   for update;

  -- Keep only the hits still inside the window
  select coalesce(array_agg(h order by h), '{}')
    into v_hits
    from unnest(coalesce(v_hits, '{}')) as h
   where h > v_cutoff;

  v_count := coalesce(array_length(v_hits, 1), 0);

  if v_count >= p_limit then
    v_oldest := v_hits[1];
    update public.rate_limits
       set hits = v_hits, updated_at = v_now
     where key = p_key;
    return query select
      false,
      0,
      greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => p_window_seconds)) - v_now))::int);
    return;
  end if;

  update public.rate_limits
     set hits = v_hits || v_now, updated_at = v_now
   where key = p_key;

  return query select true, p_limit - v_count - 1, 0;
end;
$fn$;

revoke all on function public.check_rate_limit(text, int, int) from public;
grant execute on function public.check_rate_limit(text, int, int) to service_role;
