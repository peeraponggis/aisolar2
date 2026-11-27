import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { setSessionCookies } from '@/lib/auth';
import { SIGNUP_BONUS_CREDITS } from '@/lib/pro';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { captchaMessage, verifyCaptcha } from '@/lib/captcha';
import { startTrial } from '@/lib/subscription';

export interface SignupBody {
  email: string;
  password: string;
  fullName: string;
  company: string;
  province: string;
  /** โทเคนจาก Turnstile — ต้องมีเมื่อระบบตั้งค่า captcha ไว้ */
  captchaToken?: string;
}

export async function POST(request: Request) {
  const limit = await rateLimit(`signup:${clientIp(request)}`, 5, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'สมัครถี่เกินไป กรุณารอสักครู่' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: 'ระบบยังไม่พร้อม' }, { status: 503 });

  const body = (await request.json().catch(() => null)) as Partial<SignupBody> | null;

  // ตรวจ captcha ก่อนแตะฐานข้อมูล — บัญชีขยะกินทั้งพื้นที่และโควตาอีเมลของ Supabase
  const captcha = await verifyCaptcha(String(body?.captchaToken ?? ''), clientIp(request));
  if (!captcha.ok) {
    return NextResponse.json({ ok: false, error: captchaMessage(captcha.error) }, { status: 400 });
  }

  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  const fullName = String(body?.fullName ?? '').trim();
  const company = String(body?.company ?? '').trim();
  const province = String(body?.province ?? '').trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'อีเมลไม่ถูกต้อง' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' }, { status: 400 });
  }
  if (fullName.length < 2 || company.length < 2 || province.length < 2) {
    return NextResponse.json({ ok: false, error: 'กรอกชื่อ บริษัท และจังหวัดให้ครบ' }, { status: 400 });
  }

  // ยืนยันอีเมลอัตโนมัติ — ช่างเริ่มใช้งานได้ทันที ค่อยเพิ่มขั้นตอนยืนยันเมื่อเปิดสาธารณะ
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    const duplicate = createError?.message?.toLowerCase().includes('already');
    return NextResponse.json(
      { ok: false, error: duplicate ? 'อีเมลนี้สมัครไว้แล้ว' : 'สมัครไม่สำเร็จ กรุณาลองใหม่' },
      { status: duplicate ? 409 : 502 },
    );
  }

  const userId = created.user.id;
  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    role: 'installer',
    full_name: fullName,
    company,
    province,
  });
  if (profileError) {
    // ลบ auth user ทิ้ง ไม่ให้เหลือบัญชีที่ไม่มีโปรไฟล์จนล็อกอินแล้วค้าง
    await supabase.auth.admin.deleteUser(userId);
    console.error('[signup] profile insert failed:', profileError.message);
    return NextResponse.json({ ok: false, error: 'สร้างโปรไฟล์ไม่สำเร็จ' }, { status: 502 });
  }

  await supabase.from('credit_transactions').insert({
    installer_id: userId,
    amount: SIGNUP_BONUS_CREDITS,
    reason: 'plan_bonus',
  });

  // เริ่มนับช่วงทดลองตั้งแต่วินาทีที่สมัคร ไม่ใช่ตอนเข้าใช้งานครั้งแรก
  await startTrial(userId);

  const { data: signIn } = await supabase.auth.signInWithPassword({ email, password });
  if (signIn?.session) {
    await setSessionCookies(signIn.session.access_token, signIn.session.refresh_token);
  }

  return NextResponse.json({ ok: true, credits: SIGNUP_BONUS_CREDITS });
}
