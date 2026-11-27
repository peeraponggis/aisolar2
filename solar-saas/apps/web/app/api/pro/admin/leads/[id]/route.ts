import { NextResponse } from 'next/server';
import { supabaseAsUser } from '@/lib/supabase-server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { notifyInstallersLeadListed } from '@/lib/line-notify';
import type { SEGMENT_LABEL } from '@/lib/pro';

export type ReviewResponse =
  | { ok: true; action: 'approve' | 'reject'; leadStatus: string }
  | { ok: false; error: string };

const MESSAGE: Record<string, { text: string; status: number }> = {
  not_authenticated: { text: 'กรุณาเข้าสู่ระบบ', status: 401 },
  not_admin: { text: 'ต้องเป็นผู้ดูแลระบบ', status: 403 },
  bad_action: { text: 'คำสั่งไม่ถูกต้อง', status: 400 },
  lead_not_found: { text: 'ไม่พบ lead นี้', status: 404 },
  already_reviewed: { text: 'lead นี้ถูกตรวจไปแล้ว', status: 409 },
};

/**
 * แอดมินอนุมัติหรือตีตก lead ก่อนขึ้นตลาด
 * ตรรกะอยู่ใน review_lead() (supabase/04_review_lead.sql) — ยึด auth.uid() เป็นตัวตรวจสิทธิ์
 * และเปลี่ยนสถานะได้เฉพาะ lead ที่ยังเป็น 'new' กดซ้ำจึงไม่ทำให้ lead ที่ขายไปแล้วกลับขึ้นตลาด
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ReviewResponse>> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'รหัสไม่ถูกต้อง' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as
    | { action?: string; priceCredits?: number }
    | null;
  const action = body?.action === 'reject' ? 'reject' : 'approve';
  const price = Number(body?.priceCredits);

  const supabase = supabaseAsUser(user.accessToken);
  if (!supabase) return NextResponse.json({ ok: false, error: 'ระบบยังไม่พร้อม' }, { status: 503 });

  const { data, error } = await supabase.rpc('review_lead', {
    p_lead_id: id,
    p_action: action,
    // ราคาต้องอยู่ในช่วงที่สมเหตุสมผล ไม่งั้นส่งเป็น null ให้ใช้ราคาเดิม
    p_price_credits: Number.isFinite(price) && price > 0 && price <= 100 ? Math.round(price) : null,
  });

  if (error) {
    console.error('[review] rpc failed:', error.message);
    return NextResponse.json({ ok: false, error: 'ทำรายการไม่สำเร็จ' }, { status: 502 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { out_status: string; out_lead_status: string }
    | undefined;

  if (row?.out_status === 'ok') {
    if (action === 'approve') {
      // แจ้งช่างในจังหวัดนั้นทันที — ความเร็วในการติดต่อคือทั้งหมดของตลาด lead
      const admin = supabaseAdmin();
      const { data: lead } = (await admin
        ?.from('leads')
        .select('id, province, segment, monthly_bill, suggested_kwp, price_credits')
        .eq('id', id)
        .maybeSingle()) ?? { data: null };
      if (lead) {
        await notifyInstallersLeadListed({
          id: lead.id as string,
          province: String(lead.province),
          segment: lead.segment as keyof typeof SEGMENT_LABEL,
          monthlyBill: Number(lead.monthly_bill),
          suggestedKwp: Number(lead.suggested_kwp),
          priceCredits: Number(lead.price_credits),
        }).catch(() => {});
      }
    }
    return NextResponse.json({ ok: true, action, leadStatus: row.out_lead_status });
  }

  const m = MESSAGE[row?.out_status ?? ''] ?? { text: 'ทำรายการไม่สำเร็จ', status: 502 };
  return NextResponse.json({ ok: false, error: m.text }, { status: m.status });
}
