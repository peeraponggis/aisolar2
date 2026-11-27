import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

/**
 * เช็คว่าเซิร์ฟเวอร์ยังมีชีวิตอยู่ สำหรับ healthcheck ของ Railway
 *
 * ตั้งใจให้ไม่พึ่งอะไรเลย — ไม่แตะฐานข้อมูล ไม่อ่านตัวแปรลับ ไม่เรนเดอร์ React
 * ตอบ 200 ทันทีถ้ากระบวนการยังรับ request ได้ ซึ่งเป็นสิ่งเดียวที่ healthcheck ควรถาม
 *
 * แนบ ?key=<CRON_SECRET> จะบอกด้วยว่าตัวแปรตัวไหน "ตั้งแล้ว" หรือ "ยังว่าง"
 * มีเพื่อไล่ปัญหาตอน deploy โดยเฉพาะ เพราะค่า NEXT_PUBLIC_* ถูกฝังตอน build
 * ถ้าลืมส่งเป็น build arg จะไม่มีทางรู้เลยจนกว่าจะเจอหน้าที่พังตอนใช้งานจริง
 *
 * ⚠ บอกแค่ว่า "มีค่าหรือไม่มี" ไม่เคยส่งค่าจริงออกไป และต้องมีรหัสถึงจะเห็น
 */

export const dynamic = 'force-dynamic';

/** ตัวแปรที่ถ้าขาดแล้วจะพังตอนใช้งาน แยกตามว่าอ่านตอนไหน */
const BUILD_TIME = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
];

const RUNTIME = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'TURNSTILE_SECRET_KEY',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'CRON_SECRET',
  'RESEND_API_KEY',
  'SMTP_HOST',
  'EMAIL_FROM',
];

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = new URL(request.url).searchParams.get('key') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const report = (names: string[]) =>
  Object.fromEntries(names.map((n) => [n, process.env[n] ? 'set' : 'MISSING']));

export function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: true });

  return NextResponse.json({
    ok: true,
    port: process.env.PORT ?? '(not set)',
    buildTime: report(BUILD_TIME),
    runtime: report(RUNTIME),
  });
}
