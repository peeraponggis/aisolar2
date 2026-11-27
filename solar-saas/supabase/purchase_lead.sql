-- ============================================================
-- PROINVENTIVE Solar — ซื้อ lead แบบ atomic (เฟส 2)
-- รันซ้ำได้ (create or replace) · รันใน SQL Editor หรือ supabase db push
-- ============================================================
--
-- ทำไมต้องเป็นฟังก์ชันในฐานข้อมูล ไม่ใช่โค้ดในแอป:
-- เดิมแอปเช็คยอดเครดิตแล้วค่อยเขียน lead_purchases กับ credit_transactions แยกกัน
-- ถ้าช่างยิงซื้อ lead "คนละใบ" พร้อมกันตอนเครดิตใกล้หมด ทั้งสองคำขออ่านยอดเดิมเห็นว่าพอ
-- แล้วต่างคนต่างหักเครดิต ยอดจึงติดลบได้ ที่นี่ทุกขั้นอยู่ใน transaction เดียวและมี row lock
-- คุมลำดับ ปัญหานั้นจึงเกิดไม่ได้
--
-- security definer: ฟังก์ชันนี้ต้องเขียน lead_purchases ซึ่ง schema ไม่ได้เปิดนโยบาย insert
-- ให้ผู้ใช้ และต้องอ่าน leads ที่ยังไม่ได้ซื้อ — ตัวฟังก์ชันเองคือด่านตรวจสิทธิ์ โดยยึด auth.uid()
-- set search_path = '' กันการโดนสลับ schema จึงต้องเขียนชื่อเต็มทุกที่
--
-- ชื่อคอลัมน์ผลลัพธ์ขึ้นต้นด้วย out_ เพื่อไม่ให้ชนกับชื่อคอลัมน์ในตารางระหว่างเขียน plpgsql

create or replace function public.purchase_lead(p_lead_id uuid)
returns table (out_status text, out_credits int, out_balance int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_installer uuid := auth.uid();
  v_role      public.user_role;
  v_price     int;
  v_status    public.lead_status;
  v_exclusive boolean;
  v_balance   int;
  v_purchase  uuid;
begin
  if v_installer is null then
    return query select 'not_authenticated'::text, 0, 0;
    return;
  end if;

  -- ล็อกโปรไฟล์ของช่างคนนี้ก่อน = การซื้อของช่างคนเดียวกันถูกบังคับให้เกิดทีละรายการ
  -- นี่คือจุดที่กันเครดิตติดลบจากการยิงซื้อหลายใบพร้อมกัน
  select p.role into v_role
    from public.profiles p
   where p.id = v_installer
   for update;

  if v_role is null
     or (v_role <> 'installer'::public.user_role and v_role <> 'admin'::public.user_role) then
    return query select 'not_installer'::text, 0, 0;
    return;
  end if;

  -- ล็อกแถว lead กัน lead แบบ exclusive ถูกขายให้ช่างสองคนพร้อมกัน
  select l.price_credits, l.status, l.exclusive
    into v_price, v_status, v_exclusive
    from public.leads l
   where l.id = p_lead_id
   for update;

  if not found then
    return query select 'lead_not_found'::text, 0, 0;
    return;
  end if;

  if v_status <> 'listed'::public.lead_status then
    return query select 'lead_not_listed'::text, 0, 0;
    return;
  end if;

  if exists (
    select 1 from public.lead_purchases lp
     where lp.lead_id = p_lead_id and lp.installer_id = v_installer
  ) then
    return query select 'already_purchased'::text, 0, 0;
    return;
  end if;

  select coalesce(sum(ct.amount), 0)::int into v_balance
    from public.credit_transactions ct
   where ct.installer_id = v_installer;

  if v_balance < v_price then
    return query select 'insufficient_credits'::text, v_price, v_balance;
    return;
  end if;

  insert into public.lead_purchases (lead_id, installer_id, credits_paid)
       values (p_lead_id, v_installer, v_price)
    returning id into v_purchase;

  insert into public.credit_transactions (installer_id, amount, reason, ref_id)
       values (v_installer, -v_price, 'lead_purchase', v_purchase);

  -- lead แบบ exclusive ขายได้รายเดียว ถอดออกจากตลาดทันที
  if v_exclusive then
    update public.leads set status = 'sold'::public.lead_status where id = p_lead_id;
  end if;

  return query select 'ok'::text, v_price, (v_balance - v_price);
end;
$$;

-- เรียกได้เฉพาะผู้ใช้ที่ล็อกอินแล้ว — ฟังก์ชันอ่าน auth.uid() เอง ไม่รับ installer_id จากภายนอก
revoke all on function public.purchase_lead(uuid) from public;
grant execute on function public.purchase_lead(uuid) to authenticated;
grant execute on function public.purchase_lead(uuid) to service_role;

-- บอก PostgREST ให้โหลด schema cache ใหม่ เผื่อไม่ได้รีเฟรชเอง
notify pgrst, 'reload schema';
