import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin, supabaseAsUser } from '@/lib/supabase-server';
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES } from '@/lib/branding';

export type ProfileResponse = { ok: true; logoUrl?: string } | { ok: false; error: string };

const LOGO_BUCKET = 'logos';
const EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/**
 * แก้โปรไฟล์ช่าง — ชื่อบริษัท เบอร์ จังหวัด และโลโก้สำหรับรายงาน white-label
 *
 * โลโก้เก็บใน bucket สาธารณะโดยตั้งใจ เพราะลูกค้าที่ได้รับ PDF ต้องเห็นรูปได้
 * โดยไม่ต้องล็อกอิน แต่ชื่อไฟล์เป็น uuid สุ่มและอยู่ในโฟลเดอร์ของช่างแต่ละคน
 */
export async function PATCH(request: Request): Promise<NextResponse<ProfileResponse>> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

  const asUser = supabaseAsUser(user.accessToken);
  if (!asUser) return NextResponse.json({ ok: false, error: 'ระบบยังไม่พร้อม' }, { status: 503 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: 'อ่านข้อมูลไม่ได้' }, { status: 400 });

  const patch: Record<string, unknown> = {};

  for (const [field, column, min] of [
    ['fullName', 'full_name', 2],
    ['company', 'company', 2],
    ['province', 'province', 2],
    ['phone', 'phone', 0],
  ] as const) {
    const raw = form.get(field);
    if (raw === null) continue;
    const value = String(raw).trim();
    if (value.length < min) {
      return NextResponse.json({ ok: false, error: 'ข้อมูลสั้นเกินไป' }, { status: 400 });
    }
    patch[column] = value || null;
  }

  let logoUrl: string | undefined;
  const logo = form.get('logo');
  if (logo instanceof File && logo.size > 0) {
    if (!LOGO_MIME_TYPES.includes(logo.type)) {
      return NextResponse.json({ ok: false, error: 'โลโก้ต้องเป็น PNG, JPG, WEBP หรือ SVG' }, { status: 400 });
    }
    if (logo.size > LOGO_MAX_BYTES) {
      return NextResponse.json({ ok: false, error: 'ไฟล์ใหญ่เกิน 2 MB' }, { status: 400 });
    }

    const admin = supabaseAdmin();
    if (!admin) return NextResponse.json({ ok: false, error: 'ระบบยังไม่พร้อม' }, { status: 503 });

    const path = `${user.id}/${crypto.randomUUID()}.${EXTENSION[logo.type]}`;
    const { error: uploadError } = await admin.storage
      .from(LOGO_BUCKET)
      .upload(path, logo, { contentType: logo.type, upsert: false });
    if (uploadError) {
      console.error('[profile] logo upload failed:', uploadError.message);
      return NextResponse.json({ ok: false, error: 'อัปโหลดโลโก้ไม่สำเร็จ' }, { status: 502 });
    }

    logoUrl = admin.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
    patch.logo_url = logoUrl;
  }

  if (form.get('removeLogo') === '1') patch.logo_url = null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'ไม่มีข้อมูลให้บันทึก' }, { status: 400 });
  }

  const { data, error } = await asUser
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    console.error('[profile] update failed:', error?.message);
    return NextResponse.json({ ok: false, error: 'บันทึกไม่สำเร็จ' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, ...(logoUrl ? { logoUrl } : {}) });
}
