-- PROINVENTIVE Solar - 2/3 - reject a bank-transfer top-up. Credits are untouched.

create or replace function public.reject_payment(p_payment_id uuid)
returns table (out_status text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_admin uuid := auth.uid();
  v_role  public.user_role;
  v_state text;
begin
  if v_admin is null then
    return query select 'not_authenticated'::text;
    return;
  end if;

  select p.role into v_role from public.profiles p where p.id = v_admin;

  if v_role is null or v_role <> 'admin'::public.user_role then
    return query select 'not_admin'::text;
    return;
  end if;

  select pm.status
    into v_state
    from public.payments pm
   where pm.id = p_payment_id
   for update;

  if not found then
    return query select 'payment_not_found'::text;
    return;
  end if;

  if v_state <> 'pending' then
    return query select 'already_settled'::text;
    return;
  end if;

  update public.payments set status = 'failed' where id = p_payment_id;

  return query select 'ok'::text;
end;
$fn$;

revoke all on function public.reject_payment(uuid) from public;
grant execute on function public.reject_payment(uuid) to authenticated;
grant execute on function public.reject_payment(uuid) to service_role;
