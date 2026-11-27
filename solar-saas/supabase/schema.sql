-- ============================================================
-- PROINVENTIVE Solar — Database schema (เฟส 0)
-- Supabase Postgres · รองรับธุรกิจ 3 ชั้น: Free → Lead → SaaS
-- รัน: supabase db push หรือวางใน SQL Editor
-- ต้องรัน purchase_lead.sql ต่อด้วย — การซื้อ lead ทั้งหมดทำผ่านฟังก์ชันในไฟล์นั้น
-- ============================================================

-- ---------- ผู้ใช้ (ต่อยอดจาก auth.users ของ Supabase) ----------
create type user_role as enum ('homeowner', 'installer', 'admin');
create type subscription_plan as enum ('trial', 'starter', 'pro', 'team');
create type subscription_status as enum ('active', 'past_due', 'suspended', 'cancelled');

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null default 'homeowner',
  full_name   text,
  company     text,
  phone       text,
  line_user_id text,                      -- สำหรับแจ้งเตือน lead ผ่าน LINE
  province    text,
  theme       text not null default 'solar-amber',
  logo_url    text,                       -- โลโก้สำหรับ PDF white-label
  created_at  timestamptz not null default now()
);

-- ---------- Lead (ชั้นที่ 2) ----------
create type lead_status as enum ('new', 'listed', 'sold', 'expired', 'invalid');
create type lead_segment as enum ('residential', 'sme', 'ci');  -- บ้าน / SME / C&I

create table leads (
  id            uuid primary key default gen_random_uuid(),
  source_user   uuid references profiles(id),         -- เจ้าของบ้านที่กรอกฟอร์ม (อาจ null ถ้า guest)
  contact_name  text not null,
  contact_phone text not null,
  contact_email text,
  province      text not null,
  segment       lead_segment not null,
  pea_type      smallint not null check (pea_type between 1 and 8),
  monthly_bill  numeric(12,2),            -- ค่าไฟ/เดือน (บาท)
  monthly_units numeric(12,2),            -- หน่วย/เดือน
  suggested_kwp numeric(8,2),             -- จากเอนจินคำนวณ
  calc_snapshot jsonb,                    -- ผลคำนวณเต็ม ณ เวลาสร้าง lead
  price_credits int not null default 0,   -- ราคาขายเป็นเครดิต
  exclusive     boolean not null default false,
  status        lead_status not null default 'new',
  created_at    timestamptz not null default now(),
  expires_at    timestamptz
);
create index leads_market_idx on leads (status, segment, province);

create table lead_purchases (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references leads(id),
  installer_id uuid not null references profiles(id),
  credits_paid int not null,
  purchased_at timestamptz not null default now(),
  unique (lead_id, installer_id)
);

-- ---------- เครดิต (กระเป๋าเงินซื้อ lead) ----------
create table credit_transactions (
  id           uuid primary key default gen_random_uuid(),
  installer_id uuid not null references profiles(id),
  amount       int not null,              -- + เติม / - ใช้
  reason       text not null,             -- 'topup' | 'lead_purchase' | 'refund' | 'plan_bonus'
  ref_id       uuid,                      -- อ้าง lead_purchases หรือ payment
  created_at   timestamptz not null default now()
);
create index credit_tx_user_idx on credit_transactions (installer_id, created_at desc);

-- ยอดเครดิตคงเหลือ = sum(amount) — ทำเป็น view เพื่อกัน state เพี้ยน
-- security_invoker = on บังคับให้ view ใช้สิทธิ์ของผู้เรียก ไม่ใช่ของเจ้าของ view
-- ถ้าไม่ใส่ RLS ของ credit_transactions จะถูกข้าม และช่างทุกคนจะเห็นยอดเครดิตของกันและกัน
create view credit_balances with (security_invoker = on) as
  select installer_id, coalesce(sum(amount), 0) as balance
  from credit_transactions group by installer_id;

-- ---------- Subscription (ชั้นที่ 3) ----------
create table subscriptions (
  id             uuid primary key default gen_random_uuid(),
  installer_id   uuid not null references profiles(id),
  plan           subscription_plan not null default 'trial',
  status         subscription_status not null default 'active',
  gateway        text,                    -- 'opn' | 'stripe' | 'manual'
  gateway_ref    text,                    -- customer/subscription id ฝั่ง gateway
  trial_ends_at  timestamptz,
  current_period_end timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index subs_user_idx on subscriptions (installer_id, status);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  installer_id uuid not null references profiles(id),
  amount_thb  numeric(12,2) not null,
  purpose     text not null,              -- 'subscription' | 'credit_topup'
  gateway     text not null,
  gateway_ref text,
  slip_url    text,                       -- กรณีโอน+แนบสลิป (เฟสแรก)
  status      text not null default 'pending',  -- pending | confirmed | failed
  created_at  timestamptz not null default now()
);

-- ---------- โปรเจกต์ของช่าง (mini-CRM, เฟส 3) ----------
create table projects (
  id            uuid primary key default gen_random_uuid(),
  installer_id  uuid not null references profiles(id),
  lead_id       uuid references leads(id),
  customer_name text not null,
  pea_type      smallint check (pea_type between 1 and 8),
  status        text not null default 'draft',  -- draft | quoted | won | lost
  -- เก็บ input/output ของเอนจินทั้งก้อนเป็น jsonb — schema เอนจินเปลี่ยนได้โดยไม่ migrate
  bill_input    jsonb,
  sizing_input  jsonb,
  finance_input jsonb,
  results       jsonb,
  rate_override jsonb,                    -- อัตราที่ผู้ใช้แก้เอง (mergeRates)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index projects_user_idx on projects (installer_id, updated_at desc);

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table leads enable row level security;
alter table lead_purchases enable row level security;
alter table credit_transactions enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table projects enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id);

-- ช่างเห็น lead ในตลาดแบบปกปิดข้อมูลติดต่อ (ทำผ่าน view/function ชั้น API)
-- ที่ระดับตาราง: เห็นเต็มเฉพาะ lead ที่ซื้อแล้ว หรือ admin
create policy "lead read purchased" on leads
  for select using (
    exists (select 1 from lead_purchases p
            where p.lead_id = leads.id and p.installer_id = auth.uid())
    or exists (select 1 from profiles pr where pr.id = auth.uid() and pr.role = 'admin')
  );

create policy "own purchases" on lead_purchases
  for select using (installer_id = auth.uid());
create policy "own credits" on credit_transactions
  for select using (installer_id = auth.uid());
create policy "own subscription" on subscriptions
  for select using (installer_id = auth.uid());
create policy "own payments" on payments
  for all using (installer_id = auth.uid());
create policy "own projects" on projects
  for all using (installer_id = auth.uid());
