import 'server-only';

/**
 * ตรวจ captcha ด้วย Cloudflare Turnstile
 *
 * เลือก Turnstile เพราะฟรีไม่จำกัดจำนวน ไม่ต้องให้ผู้ใช้เลือกรูปภาพในกรณีทั่วไป
 * และไม่ส่งข้อมูลผู้ใช้ให้ผู้ให้บริการโฆษณา — ฟอร์มขอใบเสนอราคาไวต่อ friction มาก
 * ถ้าใส่ captcha ที่ต้องแก้ปริศนาทุกครั้ง lead จะหายไปมากกว่าที่กัน bot ได้
 *
 * ยังไม่ตั้งค่าคีย์ = ข้ามการตรวจ (ฟอร์มยังใช้งานได้) แต่ log เตือนไว้
 * ตั้งค่าแล้ว = บังคับตรวจทุกครั้ง ไม่มีทางข้ามจากฝั่ง client
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface CaptchaResult {
  ok: boolean;
  /** true = ยังไม่ได้ตั้งค่าคีย์ จึงไม่ได้ตรวจจริง */
  skipped: boolean;
  error?: string;
}

export function isCaptchaEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

/** ข้อความ error ของ Turnstile ที่ควรแยกแยะให้ผู้ใช้เข้าใจ */
const RETRYABLE = new Set(['timeout-or-duplicate', 'invalid-input-response', 'missing-input-response']);

export async function verifyCaptcha(token: string, remoteIp?: string): Promise<CaptchaResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    console.warn('[captcha] ยังไม่ได้ตั้งค่า TURNSTILE_* — ข้ามการตรวจ captcha');
    return { ok: true, skipped: true };
  }

  if (!token) return { ok: false, skipped: false, error: 'missing-input-response' };

  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp && remoteIp !== 'unknown') form.set('remoteip', remoteIp);

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      // ถ้า Cloudflare ช้าเกิน 8 วินาที ไม่ควรให้ผู้ใช้รอต่อ
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
    if (data.success) return { ok: true, skipped: false };

    const code = data['error-codes']?.[0] ?? 'unknown';
    return { ok: false, skipped: false, error: code };
  } catch (e) {
    // ตรวจไม่ได้เพราะเครือข่าย ไม่ใช่ความผิดผู้ใช้ — ปล่อยผ่านดีกว่าทิ้ง lead จริง
    console.error('[captcha] เรียก siteverify ไม่สำเร็จ ปล่อยผ่าน:', e);
    return { ok: true, skipped: true };
  }
}

/** แปลงรหัส error เป็นข้อความไทย */
export function captchaMessage(code: string | undefined): string {
  if (code && RETRYABLE.has(code)) {
    return 'การยืนยันตัวตนหมดอายุ กรุณาลองส่งใหม่อีกครั้ง';
  }
  return 'ยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่';
}
