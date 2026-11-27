-- PROINVENTIVE Solar - 4/4 - admin review of a new lead before it reaches the marketplace.
-- approve moves 'new' -> 'listed'. reject moves 'new' -> 'invalid'.
-- Only a lead still in 'new' can be reviewed, so a double click cannot relist a sold lead.
-- The optional price lets the admin adjust the asking price at approval time.

create or replace function public.review_lead(
  p_lead_id uuid,
  p_action text,
  p_price_credits int default null
)
returns table (out_status text, out_lead_status text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_admin uuid := auth.uid();
  v_role  public.user_role;
  v_state public.lead_status;
  v_next  public.lead_status;
begin
  if v_admin is null then
    return query select 'not_authenticated'::text, ''::text;
    return;
  end if;

  select p.role into v_role from public.profiles p where p.id = v_admin;

  if v_role is null or v_role <> 'admin'::public.user_role then
    return query select 'not_admin'::text, ''::text;
    return;
  end if;

  if p_action = 'approve' then
    v_next := 'listed'::public.lead_status;
  elsif p_action = 'reject' then
    v_next := 'invalid'::public.lead_status;
  else
    return query select 'bad_action'::text, ''::text;
    return;
  end if;

  select l.status into v_state
    from public.leads l
   where l.id = p_lead_id
   for update;

  if not found then
    return query select 'lead_not_found'::text, ''::text;
    return;
  end if;

  if v_state <> 'new'::public.lead_status then
    return query select 'already_reviewed'::text, v_state::text;
    return;
  end if;

  update public.leads
     set status = v_next,
         price_credits = case
           when p_action = 'approve' and p_price_credits is not null and p_price_credits > 0
             then p_price_credits
           else price_credits
         end
   where id = p_lead_id;

  return query select 'ok'::text, v_next::text;
end;
$fn$;

revoke all on function public.review_lead(uuid, text, int) from public;
grant execute on function public.review_lead(uuid, text, int) to authenticated;
grant execute on function public.review_lead(uuid, text, int) to service_role;
