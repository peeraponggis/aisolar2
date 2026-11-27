import { NextResponse } from 'next/server';
import { supabaseAsUser } from '@/lib/supabase-server';
import { getCurrentUser } from '@/lib/auth';

export type PurchaseResponse =
  | { ok: true; creditsPaid: number; balance: number }
  | { ok: false; error: string };

/** ผลลัพธ์ที่ purchase_lead() คืนมา — เป็นสถานะ ไม่ใช่ exception จึงไม่ต้องแกะข้อความ error */
interface PurchaseRow {
  out_status:
    | 'ok'
    | 'not_authenticated'
    | 'not_installer'
    | 'lead_not_found'
    | 'lead_not_listed'
    | 'already_purchased'
    | 'insufficient_credits';
  out_credits: number;
  out_balance: number;
}

const MESSAGE: Record<Exclude<PurchaseRow['out_status'], 'ok'>, { text: string; status: number }> = {
  not_authenticated: { text: 'กรุณาเข้าสู่ระบบ', status: 401 },
  not_installer: { text: 'บัญชีนี้ไม่ใช่ผู้ติดตั้ง', status: 403 },
  lead_not_found: { text: 'ไม่พบ lead นี้', status: 404 },
  lead_not_listed: { text: 'lead นี้ไม่ได้อยู่ในตลาดแล้ว', status: 409 },
  already_purchased: { text: 'คุณซื้อ lead นี้ไปแล้ว', status: 409 },
  insufficient_credits: { text: 'เครดิตไม่พอ', status: 402 },
};

/**
 * ซื้อ lead ด้วยเครดิต
 *
 * ตรรกะทั้งหมดอยู่ใน Postgres function `purchase_lead` (ดู supabase/purchase_lead.sql)
 * เช็คสิทธิ์ · เช็คสถานะ lead · เช็คยอดเครดิต · เขียนสองตาราง อยู่ใน transaction เดียว
 * พร้อม row lock จึงไม่มีทางเครดิตติดลบหรือได้ lead ฟรีจากการยิงพร้อมกัน
 *
 * เรียกในนามผู้ใช้ (ไม่ใช่ secret key) เพื่อให้ auth.uid() ในฟังก์ชันเป็นตัวช่างจริง ๆ
 * — installer_id จึงปลอมจากฝั่ง client ไม่ได้เลย
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<PurchaseResponse>> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

  const supabase = supabaseAsUser(user.accessToken);
  if (!supabase) return NextResponse.json({ ok: false, error: 'ระบบยังไม่พร้อม' }, { status: 503 });

  const { id: leadId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) {
    return NextResponse.json({ ok: false, error: 'รหัส lead ไม่ถูกต้อง' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('purchase_lead', { p_lead_id: leadId });

  if (error) {
    console.error('[purchase] rpc failed:', error.message);
    return NextResponse.json({ ok: false, error: 'ซื้อไม่สำเร็จ กรุณาลองใหม่' }, { status: 502 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as PurchaseRow | undefined;
  if (!row) {
    return NextResponse.json({ ok: false, error: 'ซื้อไม่สำเร็จ กรุณาลองใหม่' }, { status: 502 });
  }

  if (row.out_status === 'ok') {
    return NextResponse.json({ ok: true, creditsPaid: row.out_credits, balance: row.out_balance });
  }

  const message = MESSAGE[row.out_status];
  const text =
    row.out_status === 'insufficient_credits'
      ? `เครดิตไม่พอ (มี ${row.out_balance} ต้องใช้ ${row.out_credits})`
      : message.text;

  return NextResponse.json({ ok: false, error: text }, { status: message.status });
}
