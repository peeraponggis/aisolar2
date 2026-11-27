-- PROINVENTIVE Solar - 1/3 - confirm a bank-transfer top-up and grant credits.
-- Atomic: the status change and the credit insert happen together or not at all.
-- The row lock on payments stops a double confirm from granting credits twice.

create or replace function public.confirm_payment(p_payment_id uuid, p_credits int)
returns table (out_status text, out_credits int, out_balance int)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_admin     uuid := auth.uid();
  v_role      public.user_role;
  v_installer uuid;
  v_state     text;
  v_balance   int;
begin
  if v_admin is null then
    return query select 'not_authenticated'::text, 0, 0;
    return;
  end if;

  select p.role into v_role from public.profiles p where p.id = v_admin;

  if v_role is null or v_role <> 'admin'::public.user_role then
    return query select 'not_admin'::text, 0, 0;
    return;
  end if;

  if p_credits is null or p_credits <= 0 then
    return query select 'bad_credits'::text, 0, 0;
    return;
  end if;

  select pm.installer_id, pm.status
    into v_installer, v_state
    from public.payments pm
   where pm.id = p_payment_id
   for update;

  if not found then
    return query select 'payment_not_found'::text, 0, 0;
    return;
  end if;

  if v_state <> 'pending' then
    return query select 'already_settled'::text, 0, 0;
    return;
  end if;

  update public.payments set status = 'confirmed' where id = p_payment_id;

  insert into public.credit_transactions (installer_id, amount, reason, ref_id)
  values (v_installer, p_credits, 'topup', p_payment_id);

  select coalesce(sum(ct.amount), 0)::int
    into v_balance
    from public.credit_transactions ct
   where ct.installer_id = v_installer;

  return query select 'ok'::text, p_credits, v_balance;
end;
$fn$;

revoke all on function public.confirm_payment(uuid, int) from public;
grant execute on function public.confirm_payment(uuid, int) to authenticated;
grant execute on function public.confirm_payment(uuid, int) to service_role;
