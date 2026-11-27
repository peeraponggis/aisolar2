import 'server-only';
import { supabaseAdmin, supabaseAsUser } from './supabase-server';
import { TRIAL_DAYS, entitlementsFrom, type Entitlements } from './plans';

/**
 * อ่านและตั้งค่าสมาชิกของช่าง
 *
 * ตาราง subscriptions มีนโยบายอ่านของตัวเองอยู่แล้ว (`own subscription`) แต่ไม่มีนโยบายเขียน
 * การสร้าง/ต่ออายุจึงทำด้วยสิทธิ์ระดับระบบ — ตอนสมัคร (ยังไม่มีเซสชัน) และตอนแอดมินยืนยันการชำระเงิน
 */

export interface SubscriptionRow {
  plan: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

/** สร้างสมาชิกทดลองให้ช่างที่เพิ่งสมัคร — เรียกตอน signup เท่านั้น */
export async function startTrial(installerId: string): Promise<void> {
  const admin = supabaseAdmin();
  if (!admin) return;
  const endsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from('subscriptions').insert({
    installer_id: installerId,
    plan: 'trial',
    status: 'active',
    gateway: 'manual',
    trial_ends_at: endsAt,
  });
  if (error) console.error('[subscription] สร้าง trial ไม่สำเร็จ:', error.message);
}

/** สิทธิ์ปัจจุบันของช่าง — อ่านในนามผู้ใช้ให้ RLS คุมอีกชั้น */
export async function entitlementsFor(user: {
  id: string;
  accessToken: string;
}): Promise<Entitlements> {
  const asUser = supabaseAsUser(user.accessToken);
  if (!asUser) return entitlementsFrom(null);

  const { data } = await asUser
    .from('subscriptions')
    .select('plan, status, trial_ends_at, current_period_end')
    .eq('installer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return entitlementsFrom((data as SubscriptionRow | null) ?? null);
}

/** จำนวนโปรเจกต์ที่ช่างเก็บอยู่ — ใช้เทียบกับขีดจำกัดของแพ็กเกจ */
export async function projectCount(user: { accessToken: string }): Promise<number> {
  const asUser = supabaseAsUser(user.accessToken);
  if (!asUser) return 0;
  const { count } = await asUser.from('projects').select('id', { count: 'exact', head: true });
  return count ?? 0;
}
