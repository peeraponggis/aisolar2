import 'server-only';
import { cookies } from 'next/headers';
import { supabaseAdmin, supabaseAsUser } from './supabase-server';

/**
 * เซสชันของช่างติดตั้ง เก็บใน httpOnly cookie
 *
 * token ไม่เคยออกไปอยู่ในมือ JavaScript ของหน้าเว็บเลย (ยืนยันได้ว่า document.cookie ว่าง)
 * แล้วฝั่ง server เอา token นั้นไปสร้างไคลเอนต์ในนามผู้ใช้ผ่าน supabaseAsUser()
 * การอ่านข้อมูลของช่างจึงถูก RLS บังคับอีกชั้น ไม่ได้พึ่งความถูกต้องของโค้ดอย่างเดียว
 */

const ACCESS_COOKIE = 'pi_at';
const REFRESH_COOKIE = 'pi_rt';

export interface SessionUser {
  id: string;
  email: string;
  /** JWT ที่ยังใช้ได้ — ส่งต่อให้ supabaseAsUser() เพื่อให้ RLS บังคับสิทธิ์ */
  accessToken: string;
  role: 'homeowner' | 'installer' | 'admin';
  fullName: string | null;
  company: string | null;
  province: string | null;
  theme: string;
}

export async function setSessionCookies(accessToken: string, refreshToken: string): Promise<void> {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  jar.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  });
  jar.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/**
 * อ่านผู้ใช้ปัจจุบันจาก cookie — คืน null ถ้ายังไม่ล็อกอินหรือ token หมดอายุ
 * access token อายุ 1 ชม. ถ้าหมดอายุจะลอง refresh ให้อัตโนมัติ
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  // ต้องแตะ cookies() ก่อนเช็คอย่างอื่นเสมอ — ถ้า return ออกก่อนถึง cookie
  // ตอน build (ที่ env อาจไม่ครบ) Next จะมองว่าหน้าไม่ขึ้นกับ request
  // แล้วอบผล redirect ไว้เป็น static cache เสิร์ฟให้ทุกคนรวมถึงคนที่ล็อกอินแล้ว
  const jar = await cookies();
  const accessToken = jar.get(ACCESS_COOKIE)?.value;
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (!accessToken && !refreshToken) return null;

  const supabase = supabaseAdmin();
  if (!supabase) return null;

  let userId: string | null = null;
  let email = '';
  let liveToken = '';

  if (accessToken) {
    const { data } = await supabase.auth.getUser(accessToken);
    if (data.user) {
      userId = data.user.id;
      email = data.user.email ?? '';
      liveToken = accessToken;
    }
  }

  if (!userId && refreshToken) {
    const { data } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (data.session && data.user) {
      userId = data.user.id;
      email = data.user.email ?? '';
      liveToken = data.session.access_token;
      await setSessionCookies(data.session.access_token, data.session.refresh_token);
    }
  }

  if (!userId || !liveToken) return null;

  // อ่านโปรไฟล์ในนามผู้ใช้ — นโยบาย "own profile" จะกันไม่ให้เห็นของคนอื่นแม้โค้ดจะเผลอ
  const asUser = supabaseAsUser(liveToken);
  if (!asUser) return null;

  const { data: profile } = await asUser
    .from('profiles')
    .select('role, full_name, company, province, theme')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) return null;

  return {
    id: userId,
    email,
    accessToken: liveToken,
    role: profile.role as SessionUser['role'],
    fullName: profile.full_name as string | null,
    company: profile.company as string | null,
    province: profile.province as string | null,
    theme: profile.theme as string,
  };
}

/**
 * ยอดเครดิตคงเหลือของช่าง — อ่านในนามผู้ใช้
 * view credit_balances ตั้ง security_invoker ไว้ RLS ของ credit_transactions จึงมีผล
 * ถ้าเผลอ query ของคนอื่นจะได้ค่าว่าง ไม่ใช่ยอดจริงของเขา
 */
export async function creditBalance(user: SessionUser): Promise<number> {
  const asUser = supabaseAsUser(user.accessToken);
  if (!asUser) return 0;
  const { data } = await asUser
    .from('credit_balances')
    .select('balance')
    .eq('installer_id', user.id)
    .maybeSingle();
  return Number(data?.balance ?? 0);
}
