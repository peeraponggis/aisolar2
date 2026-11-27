import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin, supabaseAsUser } from '@/lib/supabase-server';
import { isPdfAvailable, renderPdf } from '@/lib/pdf';
import { siteUrl } from '@/lib/line';

/**
 * ดาวน์โหลดรายงานเป็นไฟล์ PDF
 *
 * เห็นได้เฉพาะแอดมิน และช่างที่ซื้อ lead ใบนั้นไปแล้ว — ตรวจการซื้อในนามผู้ใช้
 * เพื่อให้ RLS ของ lead_purchases เป็นด่านที่สองแทนที่จะเชื่อโค้ดอย่างเดียว
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'รหัสไม่ถูกต้อง' }, { status: 400 });
  }

  if (user.role !== 'admin') {
    const asUser = supabaseAsUser(user.accessToken);
    const { data: purchase } = (await asUser
      ?.from('lead_purchases')
      .select('id')
      .eq('lead_id', id)
      .maybeSingle()) ?? { data: null };
    if (!purchase) {
      return NextResponse.json({ ok: false, error: 'ต้องซื้อ lead นี้ก่อน' }, { status: 403 });
    }
  }

  const admin = supabaseAdmin();
  const { data: lead } = (await admin?.from('leads').select('id').eq('id', id).maybeSingle()) ?? {
    data: null,
  };
  if (!lead) return NextResponse.json({ ok: false, error: 'ไม่พบ lead นี้' }, { status: 404 });

  if (!isPdfAvailable()) {
    return NextResponse.json(
      { ok: false, error: 'เซิร์ฟเวอร์ยังไม่มีเบราว์เซอร์สำหรับสร้าง PDF' },
      { status: 503 },
    );
  }

  try {
    const pdf = await renderPdf(siteUrl(`/report/${id}?pdf=1`));
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="PROINVENTIVE-Solar-Report-${id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('[pdf] สร้างไฟล์ไม่สำเร็จ:', e);
    return NextResponse.json({ ok: false, error: 'สร้าง PDF ไม่สำเร็จ' }, { status: 502 });
  }
}
