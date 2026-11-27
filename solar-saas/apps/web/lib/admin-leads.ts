import 'server-only';
import { supabaseAdmin } from './supabase-server';
import type { PendingLead } from '@/components/pro/ReviewLeadCard';
import type { SEGMENT_LABEL } from './pro';

/**
 * คิว lead ที่รอตรวจ — ใช้สิทธิ์ระดับระบบเพราะต้องเห็นข้อมูลติดต่อเต็มก่อนอนุมัติ
 * หน้าที่เรียกต้องกัน role admin ไว้ก่อนเสมอ
 */
export async function pendingLeads(limit = 50): Promise<PendingLead[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];

  const { data } = await supabase
    .from('leads')
    .select(
      'id, contact_name, contact_phone, province, segment, pea_type, monthly_bill, monthly_units, suggested_kwp, price_credits, created_at',
    )
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(limit);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // นับว่าเบอร์เดียวกันเคยส่งเข้ามากี่ครั้งแล้ว — ตัวช่วยจับการส่งซ้ำและ bot
  const phones = [...new Set(rows.map((r) => String(r.contact_phone)))];
  const { data: samePhone } = await supabase
    .from('leads')
    .select('id, contact_phone')
    .in('contact_phone', phones);

  const countByPhone = new Map<string, number>();
  for (const r of samePhone ?? []) {
    const phone = String(r.contact_phone);
    countByPhone.set(phone, (countByPhone.get(phone) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id as string,
    contactName: String(r.contact_name),
    contactPhone: String(r.contact_phone),
    province: String(r.province),
    segment: r.segment as keyof typeof SEGMENT_LABEL,
    peaType: Number(r.pea_type),
    monthlyBill: Number(r.monthly_bill),
    monthlyUnits: Number(r.monthly_units),
    suggestedKwp: Number(r.suggested_kwp),
    priceCredits: Number(r.price_credits),
    createdAt: r.created_at as string,
    // ไม่นับตัวมันเอง
    samePhoneCount: Math.max(0, (countByPhone.get(String(r.contact_phone)) ?? 1) - 1),
  }));
}

/** จำนวนงานค้างของแอดมิน ใช้ขึ้นตัวเลขบนเมนู */
export async function adminPendingCounts(): Promise<{ leads: number; payments: number }> {
  const supabase = supabaseAdmin();
  if (!supabase) return { leads: 0, payments: 0 };
  const [{ count: leads }, { count: payments }] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  return { leads: leads ?? 0, payments: payments ?? 0 };
}
