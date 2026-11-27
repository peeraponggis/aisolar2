import { NextResponse } from 'next/server';
import { isLineConfigured, replyMessage, text, verifyWebhookSignature } from '@/lib/line';
import { findLinkToken, readLinkToken } from '@/lib/line-token';
import { sendReportToCustomer } from '@/lib/line-notify';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Webhook ของ LINE Official Account
 *
 * หน้าที่เดียว: รับรหัสผูกบัญชีที่ผู้ใช้คัดลอกมาจากเว็บ แล้วผูก LINE userId เข้ากับ
 * โปรไฟล์ช่าง (เพื่อรับแจ้งเตือน lead) หรือกับ lead ของลูกค้า (เพื่อส่งรายงานให้)
 *
 * ต้องตอบ 200 เสมอแม้ทำงานภายในไม่สำเร็จ — ถ้าตอบ error LINE จะยิงซ้ำและปิด webhook ในที่สุด
 */

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
}

const WELCOME =
  'ขอบคุณที่เพิ่มเพื่อนครับ\n\n' +
  'ถ้าคุณเพิ่งขอรายงานวิเคราะห์โซลาร์เซลล์ ให้คัดลอก "รหัสรับรายงาน" จากหน้าเว็บมาวางในแชตนี้ ' +
  'ระบบจะส่งรายงานให้ทันที\n\n' +
  'ถ้าคุณเป็นผู้ติดตั้ง ให้คัดลอกรหัสจากหน้าแดชบอร์ดมาวาง เพื่อรับแจ้งเตือน lead ใหม่ในพื้นที่ของคุณ';

const HELP =
  'ไม่พบรหัสในข้อความครับ\n\n' +
  'รหัสขึ้นต้นด้วย v1. และคัดลอกได้จากหน้าเว็บ — กรุณาวางรหัสทั้งบรรทัด';

export async function POST(request: Request): Promise<NextResponse> {
  if (!isLineConfigured()) {
    return NextResponse.json({ ok: false, error: 'line not configured' }, { status: 503 });
  }

  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get('x-line-signature'))) {
    // ไม่ได้มาจาก LINE — ตอบ 401 เพื่อไม่ให้ใครยิงมั่วมาผูกบัญชีคนอื่น
    return NextResponse.json({ ok: false, error: 'bad signature' }, { status: 401 });
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(raw) as { events?: LineEvent[] }).events ?? [];
  } catch {
    return NextResponse.json({ ok: true });
  }

  for (const event of events) {
    try {
      await handleEvent(event);
    } catch (e) {
      console.error('[line-webhook] จัดการ event ไม่สำเร็จ:', e);
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleEvent(event: LineEvent): Promise<void> {
  const userId = event.source?.userId;
  if (!userId) return;

  if (event.type === 'follow') {
    if (event.replyToken) await replyMessage(event.replyToken, [text(WELCOME)]);
    return;
  }

  if (event.type !== 'message' || event.message?.type !== 'text') return;

  const token = findLinkToken(event.message.text ?? '');
  if (!token) {
    if (event.replyToken) await replyMessage(event.replyToken, [text(HELP)]);
    return;
  }

  const parsed = readLinkToken(token);
  if (!parsed) {
    if (event.replyToken) {
      await replyMessage(event.replyToken, [
        text('รหัสนี้ไม่ถูกต้องหรือหมดอายุแล้ว (รหัสมีอายุ 24 ชั่วโมง)\nกรุณากลับไปคัดลอกรหัสใหม่จากหน้าเว็บ'),
      ]);
    }
    return;
  }

  if (parsed.kind === 'installer') {
    const supabase = supabaseAdmin();
    if (!supabase) return;
    const { error } = await supabase
      .from('profiles')
      .update({ line_user_id: userId })
      .eq('id', parsed.id);

    if (event.replyToken) {
      await replyMessage(event.replyToken, [
        text(
          error
            ? 'ผูกบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
            : 'ผูกบัญชีเรียบร้อย\nจากนี้จะได้รับแจ้งเตือนทันทีเมื่อมี lead ใหม่ในจังหวัดของคุณ',
        ),
      ]);
    }
    return;
  }

  // lead — ส่งรายงานให้ลูกค้าทันที ไม่เก็บ LINE userId ของลูกค้าไว้
  const sent = await sendReportToCustomer(userId, parsed.id);
  if (!sent && event.replyToken) {
    await replyMessage(event.replyToken, [
      text('ไม่พบรายงานของรหัสนี้ กรุณาติดต่อทีมงาน'),
    ]);
  }
}
