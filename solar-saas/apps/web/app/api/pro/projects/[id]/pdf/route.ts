import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAsUser } from '@/lib/supabase-server';
import { isPdfAvailable, renderPdf } from '@/lib/pdf';
import { siteUrl } from '@/lib/line';

/**
 * ดาวน์โหลดรายงานโปรเจกต์เป็น PDF
 *
 * ตัวสร้าง PDF เปิดหน้า /report/project/[id] ซึ่งต้องล็อกอิน — Chromium ที่รันฝั่ง server
 * ไม่มี cookie ของช่าง จึงต้องส่ง cookie เซสชันติดไปด้วยตอนเปิดหน้า
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'รหัสไม่ถูกต้อง' }, { status: 400 });
  }

  const asUser = supabaseAsUser(user.accessToken);
  const { data } = (await asUser?.from('projects').select('id, results').eq('id', id).maybeSingle()) ?? {
    data: null,
  };
  if (!data) return NextResponse.json({ ok: false, error: 'ไม่พบโปรเจกต์นี้' }, { status: 404 });
  if (!data.results) {
    return NextResponse.json({ ok: false, error: 'ยังไม่ได้คำนวณและบันทึกโปรเจกต์นี้' }, { status: 409 });
  }

  if (!isPdfAvailable()) {
    return NextResponse.json(
      { ok: false, error: 'เซิร์ฟเวอร์ยังไม่มีเบราว์เซอร์สำหรับสร้าง PDF' },
      { status: 503 },
    );
  }

  try {
    const cookie = request.headers.get('cookie') ?? undefined;
    const pdf = await renderPdf(siteUrl(`/report/project/${id}?pdf=1`), 30000, cookie);
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="PROINVENTIVE-Project-${id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('[project-pdf] สร้างไฟล์ไม่สำเร็จ:', e);
    return NextResponse.json({ ok: false, error: 'สร้าง PDF ไม่สำเร็จ' }, { status: 502 });
  }
}
