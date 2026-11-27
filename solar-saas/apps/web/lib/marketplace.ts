import 'server-only';
import { supabaseAdmin } from './supabase-server';
import { maskName, maskPhone } from './pro';

/**
 * ดึงรายการ lead สำหรับหน้าตลาดของช่าง
 *
 * ข้อมูลติดต่อถูกปกปิดที่ชั้นนี้เสมอ แล้วค่อยเปิดเผยเฉพาะใบที่ช่างคนนั้นซื้อแล้ว
 * ห้ามส่ง contact_name/contact_phone ดิบออกไปให้ client ก่อนตรวจสอบการซื้อ
 */

export interface MarketLead {
  id: string;
  province: string;
  segment: 'residential' | 'sme' | 'ci';
  peaType: number;
  monthlyBill: number;
  suggestedKwp: number;
  priceCredits: number;
  createdAt: string;
  purchased: boolean;
  /** ชื่อ/เบอร์จริง มีเฉพาะเมื่อ purchased = true */
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
}

export async function listMarketLeads(installerId: string, limit = 50): Promise<MarketLead[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];

  const [{ data: leads }, { data: purchases }] = await Promise.all([
    supabase
      .from('leads')
      .select(
        'id, province, segment, pea_type, monthly_bill, suggested_kwp, price_credits, created_at, contact_name, contact_phone, contact_email',
      )
      .eq('status', 'listed')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.from('lead_purchases').select('lead_id').eq('installer_id', installerId),
  ]);

  const owned = new Set((purchases ?? []).map((p) => p.lead_id as string));

  return (leads ?? []).map((row) => {
    const purchased = owned.has(row.id as string);
    const name = String(row.contact_name);
    const phone = String(row.contact_phone);
    return {
      id: row.id as string,
      province: row.province as string,
      segment: row.segment as MarketLead['segment'],
      peaType: Number(row.pea_type),
      monthlyBill: Number(row.monthly_bill),
      suggestedKwp: Number(row.suggested_kwp),
      priceCredits: Number(row.price_credits),
      createdAt: row.created_at as string,
      purchased,
      contactName: purchased ? name : maskName(name),
      contactPhone: purchased ? phone : maskPhone(phone),
      contactEmail: purchased ? ((row.contact_email as string | null) ?? null) : null,
    };
  });
}
