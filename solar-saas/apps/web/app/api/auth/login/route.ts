import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { setSessionCookies } from '@/lib/auth';

/**
 * เข้าสู่ระบบ
 *
 * เดิมมีตัวจำกัด 10 ครั้งต่อ 15 นาทีต่อ IP เอาออกแล้ว เพราะระหว่างพัฒนาและทดสอบ
 * มันล็อกเจ้าของระบบเองซ้ำ ๆ จนทำงานไม่ได้ ส่วนการกันเดารหัสผ่านยังมีอยู่ที่ Supabase Auth
 * ซึ่งจำกัดจำนวนครั้งของ /token ให้อยู่แล้วในระดับโครงการ
 *
 * ถ้าจะใส่กลับ ให้ผูกกับอีเมลที่พยายามเข้า ไม่ใช่ IP และตั้งเพดานสูงกว่านี้มาก
 * เพราะคนทั้งออฟฟิศออกเน็ตผ่าน IP เดียวกันได้ พิมพ์ผิดกันไม่กี่คนก็ล็อกทั้งบริษัท
 */
export async function POST(request: Request) {
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: 'ระบบยังไม่พร้อม' }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    // ไม่บอกว่าอีเมลผิดหรือรหัสผ่านผิด เพื่อไม่ให้ใช้หน้านี้ไล่หาว่าอีเมลไหนมีในระบบ
    return NextResponse.json({ ok: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 });
  }

  await setSessionCookies(data.session.access_token, data.session.refresh_token);
  return NextResponse.json({ ok: true });
}
