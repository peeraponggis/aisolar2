import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAsUser } from '@/lib/supabase-server';
import { computeQuote } from '@/lib/quote';
import { PROJECT_SNAPSHOT_VERSION, PROJECT_STATUSES, peaTypeOf, type ProjectStatus } from '@/lib/projects';
import { validateQuoteInput } from '@/lib/quote-input';
import { sanitizeRateOverride } from '@/lib/rate-override';

export type UpdateProjectResponse = { ok: true } | { ok: false; error: string };

/**
 * บันทึกโปรเจกต์ — แก้ชื่อลูกค้า อินพุตการคำนวณ หรือสถานะ
 *
 * ผลลัพธ์คำนวณใหม่ฝั่ง server ทุกครั้งที่อินพุตเปลี่ยน ไม่รับตัวเลขที่ browser ส่งมา
 * ทุก query ทำในนามผู้ใช้ นโยบาย "own projects" จึงกันไม่ให้แก้ของช่างคนอื่นแม้โค้ดจะเผลอ
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<UpdateProjectResponse>> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

  const supabase = supabaseAsUser(user.accessToken);
  if (!supabase) return NextResponse.json({ ok: false, error: 'ระบบยังไม่พร้อม' }, { status: 503 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'รหัสไม่ถูกต้อง' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as
    | { customerName?: string; status?: string; input?: unknown }
    | null;
  if (!body) return NextResponse.json({ ok: false, error: 'อ่านข้อมูลไม่ได้' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.customerName !== undefined) {
    const name = String(body.customerName).trim();
    if (name.length < 2) return NextResponse.json({ ok: false, error: 'กรุณากรอกชื่อลูกค้า' }, { status: 400 });
    patch.customer_name = name;
  }

  if (body.status !== undefined) {
    if (!PROJECT_STATUSES.includes(body.status as ProjectStatus)) {
      return NextResponse.json({ ok: false, error: 'สถานะไม่ถูกต้อง' }, { status: 400 });
    }
    patch.status = body.status;
  }

  if (body.input !== undefined) {
    const checked = validateQuoteInput(body.input);
    if ('error' in checked) {
      return NextResponse.json({ ok: false, error: checked.error }, { status: 400 });
    }
    // อัตราค่าไฟรับเฉพาะเส้นทางของช่าง — validateQuoteInput ไม่แตะฟิลด์นี้โดยตั้งใจ
    const rateOverride = sanitizeRateOverride(
      (body.input as { rateOverride?: unknown }).rateOverride ?? {},
      checked.value.userType,
    );
    const input = { ...checked.value, rateOverride };
    const quote = computeQuote(input);
    patch.bill_input = input;
    patch.pea_type = peaTypeOf(input);
    patch.rate_override = rateOverride;
    patch.results = { version: PROJECT_SNAPSHOT_VERSION, ...quote };
  }

  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[projects] update failed:', error.message);
    return NextResponse.json({ ok: false, error: 'บันทึกไม่สำเร็จ' }, { status: 502 });
  }
  // ไม่มีแถวกลับมา = ไม่ใช่โปรเจกต์ของคนนี้ (RLS กรองออก) หรือไม่มีอยู่จริง
  if (!data) return NextResponse.json({ ok: false, error: 'ไม่พบโปรเจกต์นี้' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<UpdateProjectResponse>> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

  const supabase = supabaseAsUser(user.accessToken);
  if (!supabase) return NextResponse.json({ ok: false, error: 'ระบบยังไม่พร้อม' }, { status: 503 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'รหัสไม่ถูกต้อง' }, { status: 400 });
  }

  const { data, error } = await supabase.from('projects').delete().eq('id', id).select('id').maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: 'ลบไม่สำเร็จ' }, { status: 502 });
  if (!data) return NextResponse.json({ ok: false, error: 'ไม่พบโปรเจกต์นี้' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
