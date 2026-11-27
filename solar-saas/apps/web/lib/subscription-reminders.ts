import 'server-only';
import { supabaseAdmin } from './supabase-server';
import { isLineConfigured, linkCard, pushMessage, siteUrl } from './line';
import { entitlementsFrom, PLANS, isPlanId } from './plans';
import { rateLimit } from './rate-limit';

/**
 * เตือนช่างก่อนแพ็กเกจหมดอายุทาง LINE
 *
 * เดิมช่างจะรู้ว่าหมดอายุตอนกดสร้างโปรเจกต์ไม่ได้แล้ว ซึ่งสายเกินไป — เขาอาจกำลังคุยกับ
 * ลูกค้าอยู่ การเตือนล่วงหน้าทั้งกันรายได้รั่วและกันประสบการณ์แย่ในจังหวะสำคัญ
 *
 * กันส่งซ้ำโดยใช้ตาราง rate_limits ที่มีอยู่แล้วเป็นตัวจำว่า "ส่งไปแล้ว" — คีย์ผูกกับ
 * จำนวนวันที่เหลือซึ่งเปลี่ยนวันละครั้ง ดังนั้นหนึ่งช่วงเตือน = ส่งครั้งเดียว
 * ต่อให้ตั้ง cron ให้รันทุกชั่วโมงก็ตาม (ไม่ต้องเพิ่มคอลัมน์หรือตารางใหม่)
 */

/** เตือนเมื่อเหลืออีกกี่วัน — 0 คือวันที่หมดอายุพอดี */
export const REMINDER_DAYS = [7, 3, 1, 0];

/** หน้าต่างกันส่งซ้ำ 23 ชม. — สั้นกว่า 1 วันเพื่อไม่ให้ทับกับช่วงเตือนถัดไป */
const DEDUPE_WINDOW_MS = 23 * 60 * 60 * 1000;

/**
 * คืนตัวจำเมื่อส่งไม่สำเร็จ เพื่อให้รอบถัดไปลองใหม่ได้
 * ถ้าไม่คืน LINE ล่มชั่วคราวจะทำให้การเตือนรอบนั้นหายถาวร ทั้งที่ควรได้ลองใหม่
 * (ตัวจำยังทำหน้าที่กันสองรอบที่รันพร้อมกันส่งซ้ำอยู่เหมือนเดิม)
 */
async function releaseGuard(key: string): Promise<void> {
  const admin = supabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('rate_limits').delete().eq('key', key);
  if (error) console.error('[reminders] คืนตัวจำไม่สำเร็จ:', error.message);
}

export interface ReminderResult {
  checked: number;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  details: string[];
}

function message(planName: string, daysLeft: number, expiresAt: string) {
  const when = new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(new Date(expiresAt));
  const title = daysLeft <= 0 ? 'แพ็กเกจหมดอายุวันนี้' : `แพ็กเกจจะหมดอายุในอีก ${daysLeft} วัน`;
  const subtitle =
    daysLeft <= 0
      ? 'ตอนนี้ใช้สิทธิ์เท่าแพ็กเกจทดลอง งานเก่าทั้งหมดยังเปิดดูได้ตามปกติ'
      : 'ต่ออายุก่อนหมดจะได้ไม่เสียวันที่จ่ายไปแล้ว ระบบต่อจากวันหมดอายุเดิมให้';

  return linkCard({
    title,
    subtitle,
    rows: [
      ['แพ็กเกจ', planName],
      ['หมดอายุ', when],
    ],
    buttonLabel: 'ต่ออายุแพ็กเกจ',
    url: siteUrl('/pro/subscription'),
    footer: 'ข้อความนี้ส่งอัตโนมัติจากระบบ',
  });
}

/**
 * ตรวจทุกสมาชิกแล้วส่งเตือนที่ถึงกำหนด
 * @param dryRun ดูว่าจะส่งหาใครบ้างโดยไม่ส่งจริง
 */
export async function runSubscriptionReminders(dryRun = false): Promise<ReminderResult> {
  const result: ReminderResult = { checked: 0, due: 0, sent: 0, skipped: 0, failed: 0, details: [] };

  const admin = supabaseAdmin();
  if (!admin) {
    result.details.push('ยังไม่ได้ตั้งค่า Supabase');
    return result;
  }
  if (!isLineConfigured() && !dryRun) {
    result.details.push('ยังไม่ได้ตั้งค่า LINE — ข้ามการส่ง');
    return result;
  }

  const { data, error } = await admin
    .from('subscriptions')
    .select('installer_id, plan, status, trial_ends_at, current_period_end');

  if (error) {
    result.details.push(`อ่าน subscriptions ไม่สำเร็จ: ${error.message}`);
    return result;
  }

  const rows = data ?? [];
  result.checked = rows.length;
  if (rows.length === 0) return result;

  // ดึง line_user_id ทีเดียว ไม่ยิงทีละคน
  const ids = [...new Set(rows.map((r) => String(r.installer_id)))];
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, line_user_id, company')
    .in('id', ids);
  const lineOf = new Map(
    (profiles ?? []).map((p) => [p.id as string, { lineUserId: p.line_user_id as string | null, company: p.company as string | null }]),
  );

  for (const row of rows) {
    const installerId = String(row.installer_id);
    const ent = entitlementsFrom({
      plan: String(row.plan),
      status: String(row.status),
      trial_ends_at: (row.trial_ends_at as string | null) ?? null,
      current_period_end: (row.current_period_end as string | null) ?? null,
    });

    if (ent.daysLeft === null || !ent.expiresAt) continue;
    if (!REMINDER_DAYS.includes(ent.daysLeft)) continue;

    result.due += 1;
    const profile = lineOf.get(installerId);
    const label = profile?.company ?? installerId.slice(0, 8);

    if (!profile?.lineUserId) {
      result.skipped += 1;
      result.details.push(`${label}: เหลือ ${ent.daysLeft} วัน แต่ยังไม่ได้ผูก LINE`);
      continue;
    }

    if (dryRun) {
      result.details.push(`${label}: จะส่งเตือน เหลือ ${ent.daysLeft} วัน`);
      continue;
    }

    // ตัวจำว่าส่งไปแล้ว — คีย์ผูกกับจำนวนวันที่เหลือ จึงส่งได้ครั้งเดียวต่อช่วงเตือน
    const guardKey = `subrem:${installerId}:${ent.daysLeft}`;
    const guard = await rateLimit(guardKey, 1, DEDUPE_WINDOW_MS);
    if (!guard.ok) {
      result.skipped += 1;
      continue;
    }

    const planName = isPlanId(row.plan) ? PLANS[row.plan].name : PLANS.trial.name;
    const ok = await pushMessage(profile.lineUserId, [message(planName, ent.daysLeft, ent.expiresAt)]);
    if (ok) {
      result.sent += 1;
      result.details.push(`${label}: ส่งเตือนแล้ว (เหลือ ${ent.daysLeft} วัน)`);
    } else {
      await releaseGuard(guardKey);
      result.failed += 1;
      result.details.push(`${label}: ส่งไม่สำเร็จ จะลองใหม่รอบถัดไป`);
    }
  }

  return result;
}
