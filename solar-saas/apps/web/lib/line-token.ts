import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * รหัสผูกบัญชี LINE — เป็น token ที่เซ็นด้วย HMAC ไม่ใช่รหัสสุ่มที่ต้องเก็บในฐานข้อมูล
 *
 * ทำไมไม่เก็บรหัสในตาราง: จะต้องเพิ่มคอลัมน์ ตั้ง index และเขียนงานล้างรหัสหมดอายุ
 * ที่นี่ตัว token พกไอดีเป้าหมายมาในตัวและมีลายเซ็นกำกับ webhook จึงถอดออกมาใช้ได้ทันที
 * ปลอมไม่ได้เพราะไม่รู้ channel secret และหมดอายุเองตามเวลาที่ฝังไว้
 */

const VERSION = 'v1';
const TTL_MS = 24 * 60 * 60 * 1000;

export type LinkKind = 'installer' | 'lead';

function secret(): string | null {
  return process.env.LINE_CHANNEL_SECRET ?? null;
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url').slice(0, 16);
}

/**
 * สร้างรหัสให้ผู้ใช้คัดลอกไปส่งในแชต LINE
 * รูปแบบ: v1.<kind>.<id ย่อ>.<หมดอายุ>.<ลายเซ็น>
 */
export function createLinkToken(kind: LinkKind, id: string, now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const expires = now + TTL_MS;
  const payload = `${VERSION}.${kind}.${Buffer.from(id).toString('base64url')}.${expires}`;
  return `${payload}.${sign(payload, key)}`;
}

export interface LinkTokenResult {
  kind: LinkKind;
  id: string;
}

/** ตรวจและถอดรหัส — คืน null ถ้าลายเซ็นไม่ตรง หมดอายุ หรือรูปแบบผิด */
export function readLinkToken(token: string, now = Date.now()): LinkTokenResult | null {
  const key = secret();
  if (!key) return null;

  const parts = token.trim().split('.');
  if (parts.length !== 5) return null;
  const [version, kind, encodedId, expires, signature] = parts;
  if (version !== VERSION) return null;
  if (kind !== 'installer' && kind !== 'lead') return null;

  const expected = sign(`${version}.${kind}.${encodedId}.${expires}`, key);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return null;

  try {
    const id = Buffer.from(encodedId, 'base64url').toString('utf8');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { kind, id };
  } catch {
    return null;
  }
}

/** ดึง token ตัวแรกที่พบในข้อความ — ผู้ใช้มักพิมพ์อย่างอื่นปนมาด้วย */
export function findLinkToken(text: string): string | null {
  const match = text.match(/v1\.(?:installer|lead)\.[A-Za-z0-9_-]+\.\d+\.[A-Za-z0-9_-]+/);
  return match ? match[0] : null;
}
