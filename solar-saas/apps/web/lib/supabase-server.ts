import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * ไคลเอนต์ Supabase ฝั่ง server มีสองแบบ — เลือกให้ถูกเรื่อง
 *
 * 1. supabaseAdmin()  ใช้ secret key · ข้าม RLS ทั้งหมด
 *    ใช้เฉพาะงานที่ไม่มีผู้ใช้ล็อกอินอยู่ หรือจงใจต้องเห็นข้อมูลข้ามคน:
 *    รับ lead จากคนทั่วไป, แสดงตลาดแบบปกปิด, เปิดรายงานผ่านลิงก์ของลูกค้า, สร้างบัญชีช่าง
 *
 * 2. supabaseAsUser() ใช้ publishable key + JWT ของผู้ใช้ · RLS บังคับสิทธิ์ให้
 *    ใช้กับทุกการอ่าน/เขียนข้อมูล "ของผู้ใช้คนนั้น" — ถ้าโค้ดพลาดหลุดไปอ่านของคนอื่น
 *    ฐานข้อมูลจะปฏิเสธเอง เป็นด่านที่สองที่ไม่ขึ้นกับความถูกต้องของโค้ดในแอป
 *
 * กฎ: ถ้ามี access token อยู่ในมือ ให้ใช้ (2) เสมอ เหลือ (1) ไว้เฉพาะที่ (2) ทำไม่ได้จริง ๆ
 */

function url(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function supabaseAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const base = url();
  if (!base || !key) return null;
  return createClient(base, key, { auth: { persistSession: false } });
}

/** ไคลเอนต์ที่ทำงานในนามผู้ใช้ — RLS ของทุกตารางมีผลบังคับ */
export function supabaseAsUser(accessToken: string): SupabaseClient | null {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const base = url();
  if (!base || !key) return null;
  return createClient(base, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** ตั้งค่า Supabase ครบหรือยัง — ใช้ตัดสินใจว่าจะ fallback เป็นไฟล์ตอน dev ไหม */
export function isSupabaseConfigured(): boolean {
  return Boolean(url() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
