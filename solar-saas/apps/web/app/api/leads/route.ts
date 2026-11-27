import { NextResponse } from 'next/server';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { computeQuote, leadSegment } from '@/lib/quote';
import { SNAPSHOT_VERSION, validateLead, type LeadResponse } from '@/lib/lead';
import { supabaseAdmin } from '@/lib/supabase-server';
import { LEAD_PRICE_CREDITS } from '@/lib/pro';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { captchaMessage, verifyCaptcha } from '@/lib/captcha';
import { notifyAdminNewLead } from '@/lib/line-notify';
import { createLinkToken } from '@/lib/line-token';
import { emailReportToCustomer } from '@/lib/report-delivery';

/** ไฟล์สำรองตอน dev ที่ยังไม่ได้ตั้งค่า Supabase — กันไม่ให้ lead หายระหว่างพัฒนา */
const LOCAL_FALLBACK = path.join(process.cwd(), '.leads.local.jsonl');

/** ฟอร์มนี้คนจริงกรอกไม่กี่ครั้ง — 5 ครั้งต่อ 10 นาทีต่อ IP พอสำหรับแก้แล้วส่งใหม่ */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request): Promise<NextResponse<LeadResponse>> {
  const limit = await rateLimit(`lead:${clientIp(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'ส่งข้อมูลถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'อ่านข้อมูลไม่ได้' }, { status: 400 });
  }

  // ตรวจ captcha ก่อน validate — ยังไม่ต้องเสียเวลาคำนวณถ้าไม่ใช่คนจริง
  const captchaToken = String((body as { captchaToken?: unknown })?.captchaToken ?? '');
  const captcha = await verifyCaptcha(captchaToken, clientIp(request));
  if (!captcha.ok) {
    return NextResponse.json({ ok: false, error: captchaMessage(captcha.error) }, { status: 400 });
  }

  const checked = validateLead(body);
  if ('error' in checked) {
    return NextResponse.json({ ok: false, error: checked.error }, { status: 400 });
  }
  const { contact, input } = checked.value;

  // คำนวณใหม่ฝั่ง server เสมอ — snapshot ต้องมาจากเอนจิน ไม่ใช่จากตัวเลขที่ browser ส่งมา
  const quote = computeQuote(input);

  const segment = leadSegment(quote);
  const row = {
    // เข้าคิวรอแอดมินตรวจก่อน ยังไม่ขึ้นตลาด — เปลี่ยนเป็น 'listed' ผ่าน review_lead() เท่านั้น
    status: 'new' as const,
    price_credits: LEAD_PRICE_CREDITS[segment],
    contact_name: contact.name,
    contact_phone: contact.phone,
    contact_email: contact.email ?? null,
    province: contact.province,
    segment,
    pea_type: quote.estimate.peaType,
    monthly_bill: Number(input.monthlyBill.toFixed(2)),
    monthly_units: Number(quote.estimate.monthlyUnits.toFixed(2)),
    suggested_kwp: Number(quote.sizing.actualKwp.toFixed(2)),
    // เก็บผลคำนวณทั้งก้อน (รวมกราฟและตัวเลขสรุปทุกตัว) — /report/[leadId] อ่านจากนี่ตรง ๆ
    // ไม่คำนวณใหม่ ตัวเลขในรายงานที่ส่งไปแล้วจึงไม่เปลี่ยนแม้อัตราค่าไฟจะถูกแก้ภายหลัง
    calc_snapshot: { version: SNAPSHOT_VERSION, ...quote },
  };

  const supabase = supabaseAdmin();
  if (supabase) {
    // secret key เท่านั้น — RLS ของตาราง leads ไม่เปิด insert ให้ anon
    const { data, error } = await supabase.from('leads').insert(row).select('id').single();
    if (error) {
      console.error('[leads] supabase insert failed:', error.message);
      return NextResponse.json({ ok: false, error: 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่' }, { status: 502 });
    }
    const leadId = data.id as string;
    // แจ้งแอดมินหลังบันทึกสำเร็จแล้วเท่านั้น และไม่ให้ความล้มเหลวของ LINE ทำให้คำขอพัง
    await notifyAdminNewLead(leadId, quote, contact.province).catch(() => {});

    // สร้าง PDF ใช้เวลาหลายวินาที ถ้ารอจะทำให้ผู้ใช้ค้างอยู่หน้าฟอร์ม จึงปล่อยทำเบื้องหลัง
    // ⚠ ใช้ได้กับเซิร์ฟเวอร์ที่รันค้างไว้ (next start) — บน serverless งานหลังส่ง response
    // อาจถูกตัด ต้องย้ายไป queue หรือใช้ waitUntil ของแพลตฟอร์มนั้น
    void emailReportToCustomer(leadId).then((result) => {
      if (result === 'failed') console.error('[leads] ส่งอีเมลรายงานไม่สำเร็จ', leadId);
    });

    return NextResponse.json({
      ok: true,
      storage: 'supabase',
      leadId,
      reportUrl: `/report/${leadId}`,
      lineToken: createLinkToken('lead', leadId) ?? undefined,
    });
  }

  if (process.env.NODE_ENV === 'production') {
    console.error('[leads] ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json({ ok: false, error: 'ระบบยังไม่พร้อมรับข้อมูล' }, { status: 503 });
  }

  await appendFile(LOCAL_FALLBACK, `${JSON.stringify({ ...row, created_at: new Date().toISOString() })}\n`, 'utf8');
  console.warn('[leads] ยังไม่ได้ตั้งค่า Supabase — บันทึกลง', LOCAL_FALLBACK);
  return NextResponse.json({ ok: true, storage: 'local-file' });
}
