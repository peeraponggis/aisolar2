import { NextResponse } from 'next/server';
import { supabaseAdmin, supabaseAsUser } from '@/lib/supabase-server';
import { getCurrentUser } from '@/lib/auth';
import { SLIP_MAX_BYTES, SLIP_MIME_TYPES, findPackage } from '@/lib/pro';
import { PLANS, isPlanId } from '@/lib/plans';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export type PaymentResponse = { ok: true; paymentId: string } | { ok: false; error: string };

const SLIP_BUCKET = 'slips';

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * แจ้งโอนเงินเติมเครดิต — บันทึกเป็น payments สถานะ pending รอแอดมินตรวจสลิป
 *
 * ราคาและจำนวนเครดิตคิดจาก CREDIT_PACKAGES ฝั่ง server เสมอ ไม่รับตัวเลขจากฟอร์ม
 * เครดิตยังไม่เข้าตอนนี้ — เข้าเมื่อแอดมินกด confirm เท่านั้น
 */
export async function POST(request: Request): Promise<NextResponse<PaymentResponse>> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (user.role !== 'installer' && user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'บัญชีนี้ไม่ใช่ผู้ติดตั้ง' }, { status: 403 });
  }

  const limit = await rateLimit(`payment:${clientIp(request)}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'แจ้งโอนถี่เกินไป กรุณารอสักครู่' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'ระบบยังไม่พร้อม' }, { status: 503 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: 'อ่านข้อมูลไม่ได้' }, { status: 400 });

  // ใบแจ้งโอนมีสองแบบ: เติมเครดิตซื้อ lead กับต่ออายุแพ็กเกจสมาชิก
  // ราคาคิดจากฝั่ง server ทั้งคู่ ฟอร์มส่งมาแค่รหัส
  const purpose = form.get('purpose') === 'subscription' ? 'subscription' : 'credit_topup';
  const months = Math.min(12, Math.max(1, Number(form.get('months') ?? 1) || 1));

  let amountThb: number;
  let gatewayRef: string;

  if (purpose === 'subscription') {
    const planId = String(form.get('planId') ?? '');
    if (!isPlanId(planId) || PLANS[planId].priceThb <= 0) {
      return NextResponse.json({ ok: false, error: 'ไม่พบแพ็กเกจที่เลือก' }, { status: 400 });
    }
    amountThb = PLANS[planId].priceThb * months;
    gatewayRef = `${planId}:${months}`;
  } else {
    const pkg = findPackage(String(form.get('packageId') ?? ''));
    if (!pkg) return NextResponse.json({ ok: false, error: 'ไม่พบแพ็กเกจที่เลือก' }, { status: 400 });
    amountThb = pkg.priceThb;
    gatewayRef = pkg.id;
  }

  const slip = form.get('slip');
  if (!(slip instanceof File) || slip.size === 0) {
    return NextResponse.json({ ok: false, error: 'กรุณาแนบสลิปการโอน' }, { status: 400 });
  }
  if (!SLIP_MIME_TYPES.includes(slip.type)) {
    return NextResponse.json({ ok: false, error: 'ไฟล์ต้องเป็น JPG, PNG, WEBP หรือ PDF' }, { status: 400 });
  }
  if (slip.size > SLIP_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'ไฟล์ใหญ่เกิน 5 MB' }, { status: 400 });
  }

  // เก็บสลิปในโฟลเดอร์ของช่างเอง ชื่อไฟล์สุ่ม — bucket เป็น private เข้าถึงได้ผ่าน signed URL เท่านั้น
  const objectPath = `${user.id}/${crypto.randomUUID()}.${EXTENSION[slip.type]}`;
  const { error: uploadError } = await admin.storage
    .from(SLIP_BUCKET)
    .upload(objectPath, slip, { contentType: slip.type, upsert: false });

  if (uploadError) {
    console.error('[payments] slip upload failed:', uploadError.message);
    return NextResponse.json({ ok: false, error: 'อัปโหลดสลิปไม่สำเร็จ' }, { status: 502 });
  }

  // เขียนในนามผู้ใช้ — นโยบาย "own payments" กันไม่ให้แจ้งโอนในนามคนอื่น
  const asUser = supabaseAsUser(user.accessToken)!;
  const { data, error } = await asUser
    .from('payments')
    .insert({
      installer_id: user.id,
      amount_thb: amountThb,
      purpose,
      gateway: 'manual',
      gateway_ref: gatewayRef,
      slip_url: objectPath,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    // ลบสลิปทิ้ง ไม่ให้เหลือไฟล์กำพร้าที่ไม่มีใบแจ้งโอนอ้างถึง
    await admin.storage.from(SLIP_BUCKET).remove([objectPath]);
    console.error('[payments] insert failed:', error.message);
    return NextResponse.json({ ok: false, error: 'บันทึกการแจ้งโอนไม่สำเร็จ' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, paymentId: data.id as string });
}
