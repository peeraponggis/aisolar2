import { NextResponse } from 'next/server';
import { supabaseAsUser } from '@/lib/supabase-server';
import { getCurrentUser } from '@/lib/auth';
import { findPackage } from '@/lib/pro';
import { isPlanId } from '@/lib/plans';

export type SettleResponse =
  | { ok: true; action: 'confirm' | 'reject'; credits?: number; balance?: number }
  | { ok: false; error: string };

const MESSAGE: Record<string, { text: string; status: number }> = {
  not_authenticated: { text: 'กรุณาเข้าสู่ระบบ', status: 401 },
  not_admin: { text: 'ต้องเป็นผู้ดูแลระบบ', status: 403 },
  bad_credits: { text: 'จำนวนเครดิตไม่ถูกต้อง', status: 400 },
  bad_plan: { text: 'แพ็กเกจไม่ถูกต้อง', status: 400 },
  bad_months: { text: 'จำนวนเดือนไม่ถูกต้อง', status: 400 },
  payment_not_found: { text: 'ไม่พบใบแจ้งโอนนี้', status: 404 },
  already_settled: { text: 'ใบนี้ถูกดำเนินการไปแล้ว', status: 409 },
};

/**
 * แอดมินยืนยันหรือปฏิเสธใบแจ้งโอน
 * ตรรกะอยู่ใน Postgres function (supabase/confirm_payment.sql) — เปลี่ยนสถานะและเติมเครดิต
 * อยู่ใน transaction เดียว กดสองครั้งก็ไม่เข้าซ้ำ
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<SettleResponse>> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'รหัสไม่ถูกต้อง' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action === 'reject' ? 'reject' : 'confirm';

  const supabase = supabaseAsUser(user.accessToken);
  if (!supabase) return NextResponse.json({ ok: false, error: 'ระบบยังไม่พร้อม' }, { status: 503 });

  if (action === 'reject') {
    const { data, error } = await supabase.rpc('reject_payment', { p_payment_id: id });
    if (error) {
      console.error('[payments] reject failed:', error.message);
      return NextResponse.json({ ok: false, error: 'ทำรายการไม่สำเร็จ' }, { status: 502 });
    }
    const row = (Array.isArray(data) ? data[0] : data) as { out_status: string } | undefined;
    if (row?.out_status === 'ok') return NextResponse.json({ ok: true, action: 'reject' });
    const m = MESSAGE[row?.out_status ?? ''] ?? { text: 'ทำรายการไม่สำเร็จ', status: 502 };
    return NextResponse.json({ ok: false, error: m.text }, { status: m.status });
  }

  // จำนวนเครดิต/แพ็กเกจมาจาก gateway_ref ที่บันทึกไว้ตอนแจ้งโอน ไม่รับตัวเลขจากฝั่ง client
  const { data: payment } = await supabase
    .from('payments')
    .select('gateway_ref, status, purpose')
    .eq('id', id)
    .maybeSingle();

  if (!payment) return NextResponse.json({ ok: false, error: 'ไม่พบใบแจ้งโอนนี้' }, { status: 404 });

  if (payment.purpose === 'subscription') {
    const [planId, monthsRaw] = String(payment.gateway_ref ?? '').split(':');
    const months = Number(monthsRaw);
    if (!isPlanId(planId) || !Number.isFinite(months) || months < 1) {
      return NextResponse.json(
        { ok: false, error: 'ใบนี้อ้างแพ็กเกจที่ไม่มีแล้ว ต้องจัดการด้วยมือ' },
        { status: 409 },
      );
    }
    const { data: subData, error: subError } = await supabase.rpc('activate_subscription', {
      p_payment_id: id,
      p_plan: planId,
      p_months: Math.round(months),
    });
    if (subError) {
      console.error('[payments] activate_subscription failed:', subError.message);
      return NextResponse.json({ ok: false, error: 'ทำรายการไม่สำเร็จ' }, { status: 502 });
    }
    const subRow = (Array.isArray(subData) ? subData[0] : subData) as
      | { out_status: string; out_plan: string }
      | undefined;
    if (subRow?.out_status === 'ok') {
      return NextResponse.json({ ok: true, action: 'confirm' });
    }
    const sm = MESSAGE[subRow?.out_status ?? ''] ?? { text: 'ทำรายการไม่สำเร็จ', status: 502 };
    return NextResponse.json({ ok: false, error: sm.text }, { status: sm.status });
  }

  const pkg = findPackage(String(payment.gateway_ref ?? ''));
  if (!pkg) {
    return NextResponse.json(
      { ok: false, error: 'ใบนี้อ้างแพ็กเกจที่ไม่มีแล้ว ต้องเติมเครดิตด้วยมือ' },
      { status: 409 },
    );
  }

  const { data, error } = await supabase.rpc('confirm_payment', {
    p_payment_id: id,
    p_credits: pkg.credits,
  });

  if (error) {
    console.error('[payments] confirm failed:', error.message);
    return NextResponse.json({ ok: false, error: 'ทำรายการไม่สำเร็จ' }, { status: 502 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { out_status: string; out_credits: number; out_balance: number }
    | undefined;

  if (row?.out_status === 'ok') {
    return NextResponse.json({
      ok: true,
      action: 'confirm',
      credits: row.out_credits,
      balance: row.out_balance,
    });
  }

  const m = MESSAGE[row?.out_status ?? ''] ?? { text: 'ทำรายการไม่สำเร็จ', status: 502 };
  return NextResponse.json({ ok: false, error: m.text }, { status: m.status });
}
