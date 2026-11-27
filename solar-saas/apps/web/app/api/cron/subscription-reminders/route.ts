import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runSubscriptionReminders } from '@/lib/subscription-reminders';

/**
 * งานตามเวลา: เตือนก่อนแพ็กเกจหมดอายุ
 *
 * Next.js ไม่มีตัวตั้งเวลาในตัว ต้องมีคนเรียกจากข้างนอก — Vercel Cron, cron-job.org,
 * GitHub Actions หรือ Task Scheduler ของ Windows ก็ได้ ตั้งให้เรียกวันละครั้งพอ
 * (เรียกถี่กว่านั้นก็ไม่ส่งซ้ำ เพราะตัวจำใน rate_limits กันไว้แล้ว)
 *
 * ป้องกันด้วย CRON_SECRET เพราะ endpoint นี้ส่งข้อความหาผู้ใช้จริงได้
 * ไม่ตั้ง secret = ปิดตายไปเลย ปลอดภัยกว่าเปิดให้ใครก็เรียกได้
 */

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const url = new URL(request.url);
  const provided =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('key') ?? '';

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
  const result = await runSubscriptionReminders(dryRun);
  console.log('[cron] subscription-reminders', JSON.stringify({ dryRun, ...result, details: undefined }));

  return NextResponse.json({ ok: true, dryRun, ...result });
}

export const GET = handle;
export const POST = handle;
