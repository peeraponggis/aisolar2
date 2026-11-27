-- PROINVENTIVE Solar - 6 - admin activates a paid subscription after checking the slip.
-- Same shape as confirm_payment: flip the payment to confirmed and extend the plan in one
-- transaction, with a row lock so a double click cannot grant two months.
--
-- Extending from the later of "now" and the current period end means a member who renews
-- early keeps the days they already paid for instead of losing them.

create or replace function public.activate_subscription(
  p_payment_id uuid,
  p_plan text,
  p_months int
)
returns table (out_status text, out_plan text, out_period_end timestamptz)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_admin     uuid := auth.uid();
  v_role      public.user_role;
  v_installer uuid;
  v_state     text;
  v_current   timestamptz;
  v_start     timestamptz;
  v_end       timestamptz;
  v_sub       uuid;
begin
  if v_admin is null then
    return query select 'not_authenticated'::text, ''::text, null::timestamptz;
    return;
  end if;

  select p.role into v_role from public.profiles p where p.id = v_admin;

  if v_role is null or v_role <> 'admin'::public.user_role then
    return query select 'not_admin'::text, ''::text, null::timestamptz;
    return;
  end if;

  if p_plan not in ('trial', 'starter', 'pro', 'team') then
    return query select 'bad_plan'::text, ''::text, null::timestamptz;
    return;
  end if;

  if p_months is null or p_months < 1 or p_months > 24 then
    return query select 'bad_months'::text, ''::text, null::timestamptz;
    return;
  end if;

  select pm.installer_id, pm.status
    into v_installer, v_state
    from public.payments pm
   where pm.id = p_payment_id
   for update;

  if not found then
    return query select 'payment_not_found'::text, ''::text, null::timestamptz;
    return;
  end if;

  if v_state <> 'pending' then
    return query select 'already_settled'::text, ''::text, null::timestamptz;
    return;
  end if;

  update public.payments set status = 'confirmed' where id = p_payment_id;

  select s.id, s.current_period_end
    into v_sub, v_current
    from public.subscriptions s
   where s.installer_id = v_installer
   order by s.created_at desc
   limit 1
   for update;

  v_start := greatest(coalesce(v_current, now()), now());
  v_end := v_start + make_interval(months => p_months);

  if v_sub is null then
    insert into public.subscriptions
      (installer_id, plan, status, gateway, current_period_end)
    values
      (v_installer, p_plan::public.subscription_plan, 'active'::public.subscription_status,
       'manual', v_end);
  else
    update public.subscriptions
       set plan = p_plan::public.subscription_plan,
           status = 'active'::public.subscription_status,
           gateway = 'manual',
           current_period_end = v_end,
           updated_at = now()
     where id = v_sub;
  end if;

  return query select 'ok'::text, p_plan, v_end;
end;
$fn$;

revoke all on function public.activate_subscription(uuid, text, int) from public;
grant execute on function public.activate_subscription(uuid, text, int) to authenticated;
grant execute on function public.activate_subscription(uuid, text, int) to service_role;

-- Admins need to read every subscription to see what they are activating.
drop policy if exists "admin read subscriptions" on public.subscriptions;
create policy "admin read subscriptions" on public.subscriptions
  for select using (
    exists (
      select 1 from public.profiles pr
       where pr.id = auth.uid() and pr.role = 'admin'::public.user_role
    )
  );
